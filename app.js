(function () {
  const cfg = window.APP_CONFIG;
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  const $ = (id) => document.getElementById(id);
  const VIEWS = ["home", "pw", "order", "done", "dash"];
  const state = { role: null, name: "", password: "", cart: {}, timer: null };

  const yen = (n) => n.toLocaleString("ja-JP") + "円";

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
    return "通信に失敗しました。時間をおいてもう一度試してください。";
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
    openDash();
  };

  $("btn-enter").onclick = async () => {
    const pw = readPassword();
    if (!pw) return;
    const { data, error } = await sb.rpc("enter_room", { p_password: pw });
    if (error) { $("pw-error").textContent = errorText(error); return; }
    if (!data) { $("pw-error").textContent = "パスワードが違います。"; return; }
    state.password = pw;
    if (state.role === "resident") openDash();
    else openOrder(data);
  };

  // ---------- 3. 注文画面 ----------
  function openOrder(ownerName) {
    state.cart = {};
    $("order-who").textContent = ownerName + "さんの部屋 / あなた: " + state.name;
    $("order-error").textContent = "";
    renderMenu();
    show("order");
  }

  function cartTotal() {
    return cfg.MENU.reduce((sum, m) => sum + m.price * (state.cart[m.id] || 0), 0);
  }

  function changeQty(id, delta) {
    const next = Math.max(0, Math.min(20, (state.cart[id] || 0) + delta));
    state.cart[id] = next;
    renderMenu();
  }

  function renderMenu() {
    const box = $("menu");
    box.textContent = "";
    cfg.MENU.forEach((m) => {
      const row = el("div", "menu-row");
      const info = el("div", "menu-info");
      info.append(el("div", "menu-name", m.name), el("div", "menu-price", yen(m.price)));

      const ctl = el("div", "qty");
      const minus = el("button", "qty-btn", "−");
      minus.type = "button";
      minus.onclick = () => changeQty(m.id, -1);
      const num = el("span", "qty-num", String(state.cart[m.id] || 0));
      const plus = el("button", "qty-btn", "+");
      plus.type = "button";
      plus.onclick = () => changeQty(m.id, 1);
      ctl.append(minus, num, plus);

      row.append(info, ctl);
      box.append(row);
    });
    const total = cartTotal();
    $("order-total").textContent = yen(total);
    $("btn-submit").disabled = total === 0;
  }

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
    show("done");
  };

  $("btn-order-back").onclick = () => show("home");
  $("btn-again").onclick = () => {
    state.cart = {};
    $("order-error").textContent = "";
    renderMenu();
    show("order");
  };
  $("btn-done-home").onclick = () => show("home");

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

    orders.forEach((o) => {
      const card = el("div", "card");
      const head = el("div", "row");
      head.append(el("span", "name", o.customer_name), el("span", "name", yen(o.total)));
      card.append(head, el("div", "sub", itemsText(o.items)));
      listBox.append(card);
    });
  }

  $("btn-dash-back").onclick = () => show("home");

  renderMenu();
})();
