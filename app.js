(function () {
  const cfg = window.APP_CONFIG;
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  const $ = (id) => document.getElementById(id);
  const VIEWS = ["home", "pw", "order", "done", "dash"];
  const MAX_QTY = 4;
  const state = { role: null, name: "", password: "", cart: {}, history: [], owner: "", timer: null };

  const yen = (n) => n.toLocaleString("ja-JP") + "円";

  // ---- 部屋に入った状態を保存(退出ボタンを押すまで残る) ----
  const SESSION_KEY = "dorm_session";
  function saveSession(owner) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        role: state.role, name: state.name, password: state.password, owner: owner
      }));
    } catch (e) {}
  }
  function clearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
  }
  function loadSession() {
    try {
      const s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      if (s && (s.role === "resident" || s.role === "guest") && s.name && s.password) return s;
    } catch (e) {}
    return null;
  }
  // ---- 「お金をもらった」チェックの保存(この端末の中だけ) ----
  function paidKey() { return "dorm_paid_" + state.password; }
  function loadPaid() {
    try { return JSON.parse(localStorage.getItem(paidKey()) || "{}") || {}; } catch (e) { return {}; }
  }
  function savePaid(map) {
    try { localStorage.setItem(paidKey(), JSON.stringify(map)); } catch (e) {}
  }

  function leaveRoom() {
    if (!confirm("部屋から出ますか?(もう一度入るにはパスワードが必要です)")) return;
    clearSession();
    state.role = null;
    state.password = "";
    state.cart = {};
    state.history = [];
    show("home");
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function show(name) {
    VIEWS.forEach((v) => { $("view-" + v).hidden = v !== name; });
    if (name !== "dash" && state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
    window.scrollTo(0, 0);
  }

  function errorText(err) {
    const m = (err && err.message) || "";
    if (m.includes("password_taken")) return "そのパスワードはすでに使われています。別のパスワードにしてください。";
    if (m.includes("password_too_short")) return "パスワードは4文字以上にしてください。";
    if (m.includes("name_required")) return "名前を入力してください。";
    if (m.includes("room_not_found")) return "部屋が見つかりません。パスワードを確認してください。";
    return "通信に失敗しました。時間をおいてもう一度試してください。" + (m ? "(" + m + ")" : "");
  }

  // ---------- 1. 最初の画面 ----------
  try { $("name").value = localStorage.getItem("dorm_name") || ""; } catch (e) {}

  function chooseRole(role) {
    const name = $("name").value.trim();
    if (!name) { $("home-error").textContent = "名前を入力してください。"; return; }
    $("home-error").textContent = "";
    try { localStorage.setItem("dorm_name", name); } catch (e) {}
    state.role = role;
    state.name = name;
    state.password = "";
    $("pw-input").value = "";
    $("pw-error").textContent = "";
    if (role === "resident") {
      $("pw-title").textContent = "寮生の部屋";
      $("pw-note").textContent = "新しく部屋を作るか、作った部屋にもう一度入れます。パスワードは友達に伝えてください。";
      $("btn-create").hidden = false;
      $("btn-enter").textContent = "作った部屋に入る";
    } else {
      $("pw-title").textContent = "部屋に入る";
      $("pw-note").textContent = "寮生から教えてもらったパスワードを入力してください。";
      $("btn-create").hidden = true;
      $("btn-enter").textContent = "入る";
    }
    show("pw");
  }
  $("btn-resident").onclick = () => chooseRole("resident");
  $("btn-guest").onclick = () => chooseRole("guest");

  // ---------- 2. パスワード画面 ----------
  $("btn-back").onclick = () => show("home");

  function readPassword() {
    const pw = $("pw-input").value;
    if (!pw) { $("pw-error").textContent = "パスワードを入力してください。"; return null; }
    $("pw-error").textContent = "";
    return pw;
  }

  $("btn-create").onclick = async () => {
    const pw = readPassword();
    if (!pw) return;
    const { error } = await sb.rpc("create_room", { p_owner: state.name, p_password: pw });
    if (error) { $("pw-error").textContent = errorText(error); return; }
    state.password = pw;
    saveSession(state.name);
    openDash();
  };

  $("btn-enter").onclick = async () => {
    const pw = readPassword();
    if (!pw) return;
    const { data, error } = await sb.rpc("enter_room", { p_password: pw });
    if (error) { $("pw-error").textContent = errorText(error); return; }
    if (!data) { $("pw-error").textContent = "パスワードが違います。"; return; }
    state.password = pw;
    saveSession(data);
    if (state.role === "resident") openDash();
    else openOrder(data);
  };

  // ---------- 3. 注文画面 ----------
  function openOrder(ownerName) {
    state.owner = ownerName;
    state.cart = {};
    state.history = [];
    $("order-who").textContent = ownerName + "さんの部屋 / あなた: " + state.name;
    $("order-error").textContent = "";
    renderMenu();
    show("order");
  }

  function cartTotal() {
    return cfg.MENU.reduce((sum, m) => sum + m.price * (state.cart[m.id] || 0), 0);
  }

  function addItem(id) {
    const now = state.cart[id] || 0;
    if (now >= MAX_QTY) {
      // 上限のあとにもう一度押すと0枚に戻る
      state.cart[id] = 0;
      state.history = state.history.filter((h) => h !== id);
    } else {
      state.cart[id] = now + 1;
      state.history.push(id);
    }
    renderMenu();
  }

  function undo() {
    const id = state.history.pop();
    if (!id) return;
    state.cart[id] = Math.max(0, (state.cart[id] || 0) - 1);
    renderMenu();
  }

  function clearCart() {
    state.cart = {};
    state.history = [];
    renderMenu();
  }

  function renderMenu() {
    const box = $("menu");
    box.textContent = "";
    cfg.MENU.forEach((m) => {
      const qty = state.cart[m.id] || 0;
      const btn = el("button", "vm-btn" + (qty > 0 ? " selected" : ""));
      btn.type = "button";

      const label = el("div", "vm-label");
      const name = el("div", "vm-name", m.name);
      name.style.background = m.bg || "#f3f6ee";
      name.style.color = m.fg || "#222";
      label.append(name, el("div", "vm-price", yen(m.price)));
      btn.append(label, el("div", "vm-slot"));
      if (qty > 0) btn.append(el("div", "vm-badge", String(qty)));

      btn.onclick = () => addItem(m.id);
      box.append(btn);
    });

    const sum = $("order-summary");
    sum.textContent = "";
    const picked = cfg.MENU.filter((m) => (state.cart[m.id] || 0) > 0);
    if (picked.length === 0) {
      sum.append(el("div", "empty", "まだ選んでいません。"));
    } else {
      picked.forEach((m) => {
        const q = state.cart[m.id];
        const r = el("div", "row");
        r.append(el("span", "", m.name + " × " + q), el("span", "", yen(m.price * q)));
        sum.append(r);
      });
    }

    const total = cartTotal();
    $("order-total").textContent = yen(total);
    $("btn-submit").disabled = total === 0;
    $("btn-undo").disabled = state.history.length === 0;
    $("btn-clear").disabled = total === 0;
  }

  $("btn-undo").onclick = undo;
  $("btn-clear").onclick = clearCart;

  $("btn-submit").onclick = async () => {
    const items = cfg.MENU
      .filter((m) => (state.cart[m.id] || 0) > 0)
      .map((m) => ({ name: m.name, price: m.price, qty: state.cart[m.id] }));
    if (items.length === 0) return;
    const total = cartTotal();
    $("btn-submit").disabled = true;
    const { error } = await sb.rpc("place_order", {
      p_password: state.password,
      p_customer: state.name,
      p_items: items,
      p_total: total
    });
    if (error) {
      $("order-error").textContent = errorText(error);
      $("btn-submit").disabled = false;
      return;
    }
    const box = $("done-summary");
    box.textContent = "";
    items.forEach((it) => {
      const r = el("div", "row");
      r.append(el("span", "", it.name + " × " + it.qty), el("span", "", yen(it.price * it.qty)));
      box.append(r);
    });
    const t = el("div", "row");
    t.append(el("span", "name", "合計"), el("span", "name", yen(total)));
    box.append(t);
    $("done-pay").textContent = state.owner + "に" + yen(total) + "渡してください";
    show("done");
  };

  $("btn-leave-order").onclick = leaveRoom;
  $("btn-again").onclick = () => {
    $("order-error").textContent = "";
    clearCart();
    show("order");
  };
  $("btn-leave-done").onclick = leaveRoom;

  // ---------- 5. 寮生の画面 ----------
  function openDash() {
    $("dash-who").textContent = "寮生: " + state.name;
    $("dash-error").textContent = "";
    show("dash");
    loadOrders();
    state.timer = setInterval(loadOrders, 5000);
  }

  async function loadOrders() {
    const { data, error } = await sb.rpc("get_orders", { p_password: state.password });
    if (error) { $("dash-error").textContent = errorText(error); return; }
    $("dash-error").textContent = "";
    renderDash(data || []);
    const now = new Date();
    $("dash-updated").textContent =
      "5秒ごとに自動で更新(最終更新 " + now.toLocaleTimeString("ja-JP") + ")";
  }

  function itemsText(items) {
    return items.map((it) => it.name + " × " + it.qty).join("、");
  }

  function renderDash(orders) {
    const sumBox = $("dash-summary");
    const listBox = $("dash-list");
    sumBox.textContent = "";
    listBox.textContent = "";

    if (orders.length === 0) {
      sumBox.append(el("div", "empty", "まだ注文はありません。"));
      return;
    }

    const counts = {};
    let grand = 0;
    orders.forEach((o) => {
      grand += o.total;
      o.items.forEach((it) => { counts[it.name] = (counts[it.name] || 0) + it.qty; });
    });
    Object.keys(counts).forEach((name) => {
      const r = el("div", "row");
      r.append(el("span", "", name), el("span", "name", counts[name] + "枚"));
      sumBox.append(r);
    });
    const g = el("div", "row");
    g.append(el("span", "name", "合計金額"), el("span", "name", yen(grand)));
    sumBox.append(g);

    // 同じ名前の注文は1つの枠にまとめる
    const groups = new Map();
    orders.forEach((o) => {
      if (!groups.has(o.customer_name)) {
        groups.set(o.customer_name, { name: o.customer_name, total: 0, items: {} });
      }
      const grp = groups.get(o.customer_name);
      grp.total += o.total;
      o.items.forEach((it) => { grp.items[it.name] = (grp.items[it.name] || 0) + it.qty; });
    });

    const paid = loadPaid();
    groups.forEach((grp) => {
      // チェック時の金額と今の合計が同じときだけ「もらった」扱い(追加注文があればチェックが外れる)
      const isPaid = paid[grp.name] === grp.total;
      const card = el("div", "card" + (isPaid ? " paid" : ""));

      const label = el("label", "pay-row");
      const check = el("input");
      check.type = "checkbox";
      check.checked = isPaid;
      check.onchange = () => {
        const map = loadPaid();
        if (check.checked) map[grp.name] = grp.total;
        else delete map[grp.name];
        savePaid(map);
        card.classList.toggle("paid", check.checked);
      };
      label.append(
        check,
        el("span", "name", grp.name + "から"),
        el("span", "pay-amount", yen(grp.total))
      );

      const detail = Object.keys(grp.items).map((n) => n + " × " + grp.items[n]).join("、");
      card.append(label, el("div", "sub", detail));
      listBox.append(card);
    });
  }

  $("btn-leave-dash").onclick = leaveRoom;

  renderMenu();

  // 前回入った部屋が残っていれば、そのまま戻る
  const saved = loadSession();
  if (saved) {
    state.role = saved.role;
    state.name = saved.name;
    state.password = saved.password;
    if (saved.role === "resident") openDash();
    else openOrder(saved.owner || "");
  }
})();
