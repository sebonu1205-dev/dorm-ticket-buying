(function () {
  const cfg = window.APP_CONFIG;
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  const $ = (id) => document.getElementById(id);
  const VIEWS = ["home", "pw", "order", "done", "dash"];
  const MAX_QTY = 4;
  const state = { role: null, name: "", password: "", cart: {}, history: [], owner: "", timer: null, lastSig: null, dragging: false, days: new Map(), members: null, blocked: null, calMonth: null, sheet: null, tab: "today" };

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

  // ポップアップ(画面の真ん中にメッセージを出して、OKで閉じる)
  function showPopup(message) {
    $("popup-text").textContent = message;
    $("popup").hidden = false;
    $("popup-ok").focus();
  }

  // 寮生に退出させられたとき(注文する人の画面から、最初の画面へ戻す)
  function kickedOut() {
    clearSession();
    state.role = null;
    state.password = "";
    state.cart = {};
    state.history = [];
    show("home");
    $("home-error").textContent = "";
    showPopup("この部屋から退出させられました。");
  }

  function leaveRoom() {
    if (!confirm("部屋から出ますか?(もう一度入るにはパスワードが必要です)")) return;
    clearSession();
    state.role = null;
    state.password = "";
    state.cart = {};
    state.history = [];
    state.lastSig = null;
    state.sheet = null;
    state.days = new Map();
    state.members = null;
    state.blocked = null;
    $("sheet").hidden = true;
    $("dash-blocked").hidden = true;
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
    if (/join_room|get_members|delete_orders/.test(m)) return "新しいSQLがまだ実行されていません。supabase_add_calendar.sql をSupabaseで実行してください。";
    if (/kick_member|unblock_member|get_blocked/.test(m)) return "新しいSQLがまだ実行されていません。supabase_add_kick.sql をSupabaseで実行してください。";
    if (/delete_blocked/.test(m)) return "新しいSQLがまだ実行されていません。supabase_add_forget.sql をSupabaseで実行してください。";
    if (m.includes("kicked")) return "この部屋から退出させられました。";
    if (m.includes("delete_customer_orders")) return "削除用のSQLがまだ実行されていません。supabase_add_delete.sql をSupabaseで実行してください。";
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
    if (state.role !== "resident") {
      const j = await sb.rpc("join_room", { p_password: pw, p_name: state.name });
      if (j.error && String(j.error.message || "").includes("kicked")) {
        $("pw-error").textContent = "";
        showPopup("この部屋には入れません。寮生に退出させられています。");
        return;
      }
    }
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
    syncMembers();
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
      if (String(error.message || "").includes("kicked")) { kickedOut(); return; }
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
    syncMembers();
  };
  $("btn-leave-done").onclick = leaveRoom;

  // ---------- 5. 寮生の画面 ----------
  const WD = ["日", "月", "火", "水", "木", "金", "土"];
  const CHIP_COLORS = ["#d9483b", "#c9741a", "#3f9a5f", "#3b7dd8", "#7d5bc9", "#cc4f86", "#228f8f", "#7a8230"];

  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function dateKey(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
  function parseKey(k) { const p = k.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function dayLabel(k) {
    const d = parseKey(k);
    return (d.getMonth() + 1) + "月" + d.getDate() + "日(" + WD[d.getDay()] + ")";
  }
  function colorFor(name) {
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return CHIP_COLORS[h % CHIP_COLORS.length];
  }
  function paidKeyOf(g) { return g.date + "|" + g.name; }
  function setPaid(g, on) {
    const map = loadPaid();
    if (on) map[paidKeyOf(g)] = g.total;
    else delete map[paidKeyOf(g)];
    savePaid(map);
  }

  // 注文を「日付 → 人 → 合計」にまとめる(同じ日に同じ人が2回頼んでも1つになる)
  function buildDays(rows) {
    const days = new Map();
    rows.forEach((o) => {
      const k = dateKey(new Date(o.created_at));
      if (!days.has(k)) days.set(k, new Map());
      const day = days.get(k);
      if (!day.has(o.customer_name)) {
        day.set(o.customer_name, { name: o.customer_name, date: k, total: 0, items: {}, ids: [] });
      }
      const g = day.get(o.customer_name);
      g.total += o.total;
      if (o.order_id) g.ids.push(o.order_id);
      o.items.forEach((it) => { g.items[it.name] = (g.items[it.name] || 0) + it.qty; });
    });
    return days;
  }

  // ---- 部屋にいる人の名前(寮生・寮生でない人の両方の画面で使う) ----
  function renderMembers(box, list, failed, kickable) {
    box.textContent = "";
    box.append(el("div", "members-title", "この部屋の人"));
    if (failed) { box.append(el("div", "empty", "名前の一覧を読み込めませんでした。")); return; }
    if (!list) { box.append(el("div", "empty", "読み込み中…")); return; }
    const sorted = list.slice().sort((a, b) =>
      (b.is_owner ? 1 : 0) - (a.is_owner ? 1 : 0) || a.member_name.localeCompare(b.member_name, "ja"));
    const wrap = el("div", "members-list");
    sorted.forEach((m) => {
      const tags = [];
      if (m.is_owner) tags.push("寮生");
      if (m.member_name === state.name) tags.push("あなた");
      const text = m.member_name + (tags.length ? "(" + tags.join("・") + ")" : "");
      const chip = el("span", "member-chip" + (m.is_owner ? " owner" : ""), text);
      if (kickable && !m.is_owner) {
        const x = el("button", "chip-x", "×");
        x.type = "button";
        x.setAttribute("aria-label", m.member_name + "さんを退出させる");
        x.onclick = () => kickMember(m.member_name);
        chip.append(x);
      }
      wrap.append(chip);
    });
    box.append(wrap);
  }

  async function syncMembers() {
    const box = $("order-members");
    renderMembers(box, null, false);
    const j = await sb.rpc("join_room", { p_password: state.password, p_name: state.name });
    if (j.error && String(j.error.message || "").includes("kicked")) { kickedOut(); return; }
    const { data, error } = await sb.rpc("get_members", { p_password: state.password });
    renderMembers(box, error ? null : (data || []), !!error);
  }

  function openDash() {
    $("dash-who").textContent = "寮生: " + state.name;
    $("dash-error").textContent = "";
    state.lastSig = null;
    state.sheet = null;
    state.days = new Map();
    state.members = null;
    const now = new Date();
    state.calMonth = { y: now.getFullYear(), m: now.getMonth() };
    $("sheet").hidden = true;
    setTab("today");
    renderMembers($("dash-members"), null, false);
    show("dash");
    loadOrders();
    state.timer = setInterval(loadOrders, 5000);
  }

  function setTab(t) {
    state.tab = t;
    $("pane-today").hidden = t !== "today";
    $("pane-cal").hidden = t !== "cal";
    $("tab-today").classList.toggle("active", t === "today");
    $("tab-cal").classList.toggle("active", t === "cal");
  }

  async function loadOrders() {
    const [o, m, b] = await Promise.all([
      sb.rpc("get_orders", { p_password: state.password }),
      sb.rpc("get_members", { p_password: state.password }),
      sb.rpc("get_blocked", { p_password: state.password })
    ]);
    if (o.error) { $("dash-error").textContent = errorText(o.error); return; }
    $("dash-error").textContent = "";
    const rows = o.data || [];
    const members = m.error ? null : (m.data || []);
    const blocked = b.error ? null : (b.data || []);
    const sig = JSON.stringify([rows, members, blocked, dateKey(new Date())]);
    // 中身が変わっていない間や、スライド操作中は画面を作り直さない
    if (!state.dragging && sig !== state.lastSig) {
      state.lastSig = sig;
      state.days = buildDays(rows);
      state.members = members;
      state.blocked = blocked;
      renderAll();
    }
    $("dash-updated").textContent =
      "5秒ごとに自動で更新(最終更新 " + new Date().toLocaleTimeString("ja-JP") + ")";
  }

  function renderAll() {
    renderMembers($("dash-members"), state.members, state.members === null, true);
    renderBlocked();
    renderToday();
    renderCalendar();
    renderSheet();
  }

  // ---------- メンバーを退出させる ----------
  async function kickMember(name) {
    if (!confirm(name + "さんを部屋から退出させますか?\n同じ名前では、もう入れなくなります。(注文の記録は残ります)")) return;
    const { error } = await sb.rpc("kick_member", { p_password: state.password, p_name: name });
    if (error) { $("dash-error").textContent = errorText(error); return; }
    state.lastSig = null;
    loadOrders();
  }

  async function unblockMember(name) {
    const { error } = await sb.rpc("unblock_member", { p_password: state.password, p_name: name });
    if (error) { $("dash-error").textContent = errorText(error); return; }
    state.lastSig = null;
    loadOrders();
  }

  async function deleteBlocked(name) {
    if (!confirm(name + "さんの名前を一覧から消しますか?\n同じ名前でも、また部屋に入れるようになります。(注文の記録は残ります)")) return;
    const { error } = await sb.rpc("delete_blocked", { p_password: state.password, p_name: name });
    if (error) { $("dash-error").textContent = errorText(error); return; }
    state.lastSig = null;
    loadOrders();
  }

  function renderBlocked() {
    const box = $("dash-blocked");
    const list = state.blocked;
    box.textContent = "";
    if (!list || list.length === 0) { box.hidden = true; return; }
    box.hidden = false;
    box.append(el("div", "members-title", "退出させた人(同じ名前では入れません)"));
    box.append(el("div", "hint", "許可: メンバーに戻す / 削除: 名前を消す(同じ名前でまた入れます)"));
    const wrap = el("div", "members-list");
    list.forEach((b) => {
      const chip = el("span", "member-chip blocked", b.blocked_name);
      const ok = el("button", "chip-x chip-ok", "許可");
      ok.type = "button";
      ok.onclick = () => unblockMember(b.blocked_name);
      const del = el("button", "chip-x chip-del", "削除");
      del.type = "button";
      del.onclick = () => deleteBlocked(b.blocked_name);
      chip.append(ok, del);
      wrap.append(chip);
    });
    box.append(wrap);
  }

  // ---------- カレンダー(TimeTreeふう) ----------
  function renderCalendar() {
    const y = state.calMonth.y;
    const m = state.calMonth.m;
    $("cal-title").textContent = y + "年" + (m + 1) + "月";
    const grid = $("cal-grid");
    grid.textContent = "";

    const w = new Date(y, m, 1).getDay();
    const dim = new Date(y, m + 1, 0).getDate();
    const rows = Math.ceil((w + dim) / 7);
    const todayKey = dateKey(new Date());
    const paid = loadPaid();

    for (let i = 0; i < rows * 7; i++) {
      const d = new Date(y, m, 1 - w + i);
      const k = dateKey(d);
      const dow = d.getDay();
      const cell = el("div", "cal-cell" + (d.getMonth() !== m ? " other" : ""));
      cell.append(el("span",
        "cal-day" + (dow === 0 ? " sun" : dow === 6 ? " sat" : "") + (k === todayKey ? " today" : ""),
        String(d.getDate())));

      const day = state.days.get(k);
      if (day && day.size > 0) {
        const groups = Array.from(day.values());
        groups.slice(0, 3).forEach((g) => {
          const isP = paid[paidKeyOf(g)] === g.total;
          const chip = el("button", "cal-chip" + (isP ? " paid" : ""), (isP ? "✓" : "") + g.name);
          chip.type = "button";
          chip.style.background = colorFor(g.name);
          chip.onclick = (e) => {
            e.stopPropagation();
            openSheet({ type: "person", date: k, name: g.name });
          };
          cell.append(chip);
        });
        if (groups.length > 3) cell.append(el("div", "cal-more", "+" + (groups.length - 3)));
        cell.classList.add("has");
        cell.onclick = () => openSheet({ type: "day", date: k });
      }
      grid.append(cell);
    }
  }

  function shiftMonth(delta) {
    const x = new Date(state.calMonth.y, state.calMonth.m + delta, 1);
    state.calMonth = { y: x.getFullYear(), m: x.getMonth() };
    renderCalendar();
  }

  // ---------- 下から出てくる詳細(日の一覧 / 人ごとの注文) ----------
  function openSheet(s) { state.sheet = s; renderSheet(); }
  function closeSheet() { state.sheet = null; $("sheet").hidden = true; }

  function renderSheet() {
    const s = state.sheet;
    if (!s) { $("sheet").hidden = true; return; }
    const day = state.days.get(s.date);
    const body = $("sheet-body");
    body.textContent = "";
    const paid = loadPaid();

    if (s.type === "day") {
      $("sheet-title").textContent = dayLabel(s.date) + "の注文";
      if (!day || day.size === 0) {
        body.append(el("div", "empty", "この日の注文はありません。"));
      } else {
        let grand = 0;
        day.forEach((g) => {
          grand += g.total;
          const isP = paid[paidKeyOf(g)] === g.total;
          const row = el("button", "sheet-row");
          row.type = "button";
          const dot = el("span", "sheet-dot");
          dot.style.background = colorFor(g.name);
          row.append(dot, el("span", "sheet-name", g.name),
            el("span", "sheet-sub", isP ? "✓ もらった" : "まだ"),
            el("span", "sheet-amt", yen(g.total)));
          row.onclick = () => openSheet({ type: "person", date: s.date, name: g.name, from: "day" });
          body.append(row);
        });
        body.append(el("div", "sheet-total", "合計 " + yen(grand)));
      }
    } else {
      $("sheet-title").textContent = s.name + "さん";
      if (s.from === "day") {
        const back = el("button", "sheet-back", "← この日の一覧へ");
        back.type = "button";
        back.onclick = () => openSheet({ type: "day", date: s.date });
        body.append(back);
      }
      body.append(el("div", "sheet-date", dayLabel(s.date)));
      const g = day && day.get(s.name);
      if (!g) {
        body.append(el("div", "empty", "この注文は見つかりません。"));
      } else {
        const isP = paid[paidKeyOf(g)] === g.total;
        body.append(el("div", "pill " + (isP ? "ok" : "no"),
          isP ? "✓ お金をもらいました" : "まだお金をもらっていません"));

        const card = el("div", "card");
        Object.keys(g.items).forEach((n) => {
          const r = el("div", "row");
          r.append(el("span", "", n + " × " + g.items[n]));
          card.append(r);
        });
        const t = el("div", "row");
        t.append(el("span", "name", "合計"), el("span", "name", yen(g.total)));
        card.append(t);
        body.append(card);

        const label = el("label", "pay-row sheet-check");
        const cb = el("input");
        cb.type = "checkbox";
        cb.checked = isP;
        cb.onchange = () => { setPaid(g, cb.checked); renderAll(); };
        label.append(cb, el("span", "name", "お金をもらった(チェック)"));
        body.append(label);
      }
    }
    $("sheet").hidden = false;
  }

  // ---- チェック済みの枠を横にスライドして削除 ----
  function enableSwipe(card, onDelete) {
    const THRESHOLD = 110;
    let startX = 0, startY = 0, dx = 0;
    let active = false, moving = false, justDragged = false;

    card.style.touchAction = "pan-y";

    card.addEventListener("pointerdown", (e) => {
      if (!card.classList.contains("paid")) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      startX = e.clientX;
      startY = e.clientY;
      dx = 0;
      active = true;
      moving = false;
    });

    card.addEventListener("pointermove", (e) => {
      if (!active) return;
      dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!moving) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { active = false; return; }
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
          moving = true;
          state.dragging = true;
          try { card.setPointerCapture(e.pointerId); } catch (err) {}
          card.style.transition = "none";
        } else {
          return;
        }
      }
      card.style.transform = "translateX(" + dx + "px)";
      card.style.opacity = String(Math.max(0.25, 0.55 - Math.abs(dx) / 500));
    });

    function finish() {
      if (!active) return;
      active = false;
      if (!moving) return;
      moving = false;
      justDragged = true;
      setTimeout(() => { justDragged = false; }, 60);
      card.style.transition = "transform 0.18s, opacity 0.18s";
      if (Math.abs(dx) >= THRESHOLD) {
        card.style.transform = "translateX(" + (dx > 0 ? 600 : -600) + "px)";
        card.style.opacity = "0";
        setTimeout(() => { state.dragging = false; onDelete(); }, 180);
      } else {
        card.style.transform = "";
        card.style.opacity = "";
        state.dragging = false;
      }
    }
    card.addEventListener("pointerup", finish);
    card.addEventListener("pointercancel", finish);

    // スライドの直後に、チェックが切り替わってしまうのを防ぐ
    card.addEventListener("click", (e) => {
      if (justDragged) { e.preventDefault(); e.stopPropagation(); }
    }, true);
  }

  async function deleteGroup(grp) {
    if (!grp.ids.length) {
      state.dragging = false;
      $("dash-error").textContent = errorText({ message: "delete_orders" });
      renderAll();
      return;
    }
    const { error } = await sb.rpc("delete_orders", { p_password: state.password, p_ids: grp.ids });
    state.lastSig = null;
    if (error) {
      await loadOrders();
      $("dash-error").textContent = errorText(error);
      return;
    }
    const map = loadPaid();
    delete map[paidKeyOf(grp)];
    savePaid(map);
    loadOrders();
  }

  // ---------- 「今日」タブ(今日の注文だけ) ----------
  function renderToday() {
    const sumBox = $("dash-summary");
    const listBox = $("dash-list");
    sumBox.textContent = "";
    listBox.textContent = "";
    const todayKey = dateKey(new Date());
    $("today-label").textContent =
      "今日(" + dayLabel(todayKey) + ")の注文だけ表示しています。ほかの日は「カレンダー」で見られます。";

    const day = state.days.get(todayKey);
    if (!day || day.size === 0) {
      sumBox.append(el("div", "empty", "今日の注文はまだありません。"));
      return;
    }
    const groups = Array.from(day.values());

    const counts = {};
    let grand = 0;
    groups.forEach((g) => {
      grand += g.total;
      Object.keys(g.items).forEach((n) => { counts[n] = (counts[n] || 0) + g.items[n]; });
    });
    Object.keys(counts).forEach((n) => {
      const r = el("div", "row");
      r.append(el("span", "", n), el("span", "name", counts[n] + "枚"));
      sumBox.append(r);
    });
    const gt = el("div", "row");
    gt.append(el("span", "name", "合計金額"), el("span", "name", yen(grand)));
    sumBox.append(gt);

    const paid = loadPaid();
    groups.forEach((grp) => {
      // チェック時の金額と今の合計が同じときだけ「もらった」扱い(追加注文があればチェックが外れる)
      const isPaid = paid[paidKeyOf(grp)] === grp.total;
      const card = el("div", "card" + (isPaid ? " paid" : ""));

      const label = el("label", "pay-row");
      const check = el("input");
      check.type = "checkbox";
      check.checked = isPaid;
      check.onchange = () => { setPaid(grp, check.checked); renderAll(); };
      label.append(check, el("span", "name", grp.name + "から"), el("span", "pay-amount", yen(grp.total)));

      const detail = Object.keys(grp.items).map((n) => n + " × " + grp.items[n]).join("、");
      card.append(label, el("div", "sub", detail), el("div", "swipe-hint", "← 横にスライドして削除 →"));
      enableSwipe(card, () => deleteGroup(grp));
      listBox.append(card);
    });
  }

  $("btn-leave-dash").onclick = leaveRoom;
  $("tab-today").onclick = () => setTab("today");
  $("tab-cal").onclick = () => { setTab("cal"); renderCalendar(); };
  $("cal-prev").onclick = () => shiftMonth(-1);
  $("cal-next").onclick = () => shiftMonth(1);
  $("cal-today").onclick = () => {
    const n = new Date();
    state.calMonth = { y: n.getFullYear(), m: n.getMonth() };
    renderCalendar();
  };
  $("sheet-close").onclick = closeSheet;
  $("sheet-backdrop").onclick = closeSheet;
  $("popup-ok").onclick = () => { $("popup").hidden = true; };

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
