import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut, updateProfile,
  setPersistence, inMemoryPersistence
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, getDoc, query, where, writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// 새로고침/재접속 시 자동 로그인되지 않도록, 로그인 상태를 브라우저에 저장하지 않고
// 현재 탭의 메모리에서만 유지합니다. (새로고침하면 다시 로그인해야 함)
setPersistence(auth, inMemoryPersistence).catch((err) => console.error(err));

const BASE_URL = window.location.href.replace(/index\.html.*$/, "").replace(/\?.*$/, "");

let currentUser = null;
let allRegisters = [];
let activeRegisterId = null;

/* ---------------- helpers ---------------- */

const $ = (id) => document.getElementById(id);

function showToast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}

function openModal(id) { $(id).classList.add("show"); }
function closeModal(id) { $(id).classList.remove("show"); }

document.querySelectorAll("[data-close]").forEach((btn) => {
  btn.addEventListener("click", () => closeModal(btn.dataset.close));
});

function fmtDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString("ko-KR", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit"
  });
}

/* ---------------- auth ---------------- */

$("showSignup").addEventListener("click", (e) => {
  e.preventDefault();
  $("loginForm").style.display = "none";
  $("signupForm").style.display = "block";
});
$("showLogin").addEventListener("click", (e) => {
  e.preventDefault();
  $("signupForm").style.display = "none";
  $("loginForm").style.display = "block";
});

$("loginBtn").addEventListener("click", async () => {
  const email = $("loginEmail").value.trim();
  const pw = $("loginPassword").value;
  $("loginError").classList.remove("show");
  try {
    await signInWithEmailAndPassword(auth, email, pw);
  } catch (err) {
    $("loginError").textContent = "로그인에 실패했습니다. 이메일/비밀번호를 확인해주세요.";
    $("loginError").classList.add("show");
  }
});

$("signupBtn").addEventListener("click", async () => {
  const org = $("signupOrg").value.trim();
  const email = $("signupEmail").value.trim();
  const pw = $("signupPassword").value;
  const pw2 = $("signupPassword2").value;
  $("signupError").classList.remove("show");

  if (!org || !email || !pw) {
    $("signupError").textContent = "모든 항목을 입력해주세요.";
    $("signupError").classList.add("show");
    return;
  }
  if (pw !== pw2) {
    $("signupError").textContent = "비밀번호가 일치하지 않습니다.";
    $("signupError").classList.add("show");
    return;
  }
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pw);
    await updateProfile(cred.user, { displayName: org });
  } catch (err) {
    $("signupError").textContent = "가입에 실패했습니다: " + (err.message || "");
    $("signupError").classList.add("show");
  }
});

$("logoutBtn").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (user) {
    $("authView").style.display = "none";
    $("dashView").style.display = "block";
    $("whoLabel").textContent = user.displayName || user.email;
    loadRegisters();
  } else {
    $("authView").style.display = "block";
    $("dashView").style.display = "none";
  }
});

/* ---------------- registers: load & render ---------------- */

async function loadRegisters() {
  try {
    // where절만 사용 (orderBy를 함께 쓰면 Firestore 복합 색인이 필요해서, 정렬은 아래서 직접 처리)
    const q = query(collection(db, "registers"), where("ownerUid", "==", currentUser.uid));
    const snap = await getDocs(q);
    allRegisters = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    allRegisters.sort((a, b) => {
      const at = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
      const bt = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
      return bt - at;
    });
    renderRegisters(allRegisters);
  } catch (err) {
    showToast("목록을 불러오지 못했습니다: " + err.message);
    console.error(err);
  }
}

function renderRegisters(list) {
  const wrap = $("registerList");
  wrap.innerHTML = "";
  $("emptyState").style.display = list.length ? "none" : "block";

  list.forEach((r) => {
    const card = document.createElement("div");
    card.className = "register-card";
    card.style.borderLeftColor = r.borderColor || "#2B5FAD";
    card.innerHTML = `
      <div class="info">
        <div class="org">${escapeHtml(r.org || "")}</div>
        <h3>${escapeHtml(r.title || "(제목 없음)")}</h3>
        <div class="meta">
          <span>🗓 ${fmtDateTime(r.dateTime)}</span>
          <span>📍 ${escapeHtml(r.location || "-")}</span>
        </div>
      </div>
      <div class="actions">
        <button class="btn btn-sm" data-act="edit">✏️ 정보수정</button>
        <button class="btn btn-sm" data-act="prelist">📝 명단입력</button>
        <button class="btn btn-sm" data-act="qr">🔗 QR</button>
        <button class="btn btn-sm" data-act="attendees">📋 참석자/PDF</button>
        <button class="btn btn-sm btn-danger" data-act="delete">삭제</button>
      </div>
    `;
    card.querySelector('[data-act="edit"]').addEventListener("click", () => openEditModal(r));
    card.querySelector('[data-act="prelist"]').addEventListener("click", () => openPreListModal(r));
    card.querySelector('[data-act="qr"]').addEventListener("click", () => openQrModal(r));
    card.querySelector('[data-act="attendees"]').addEventListener("click", () => openAttendeeModal(r));
    card.querySelector('[data-act="delete"]').addEventListener("click", () => deleteRegister(r));
    wrap.appendChild(card);
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

$("searchInput").addEventListener("input", (e) => {
  const kw = e.target.value.trim().toLowerCase();
  const filtered = allRegisters.filter((r) =>
    (r.org || "").toLowerCase().includes(kw) || (r.title || "").toLowerCase().includes(kw)
  );
  renderRegisters(filtered);
});

/* ---------------- create / edit register ---------------- */

const PALETTE = ["#2B5FAD", "#2E9E6C", "#C0562B", "#8C5FD1", "#D1A62E", "#D1477A"];

$("openCreateModal").addEventListener("click", () => {
  $("registerModalTitle").textContent = "새 연수등록부 생성";
  $("registerId").value = "";
  $("regOrg").value = currentUser.displayName || "";
  $("regTitle").value = "";
  $("regDate").value = "";
  $("regLocation").value = "";
  $("regColor").value = PALETTE[allRegisters.length % PALETTE.length];
  $("registerModalError").classList.remove("show");
  openModal("registerModalBackdrop");
});

function openEditModal(r) {
  $("registerModalTitle").textContent = "🛠 연수 정보 수정";
  $("registerId").value = r.id;
  $("regOrg").value = r.org || "";
  $("regTitle").value = r.title || "";
  $("regDate").value = r.dateTime || "";
  $("regLocation").value = r.location || "";
  $("regColor").value = r.borderColor || "#2B5FAD";
  $("registerModalError").classList.remove("show");
  openModal("registerModalBackdrop");
}

$("saveRegisterBtn").addEventListener("click", async () => {
  const id = $("registerId").value;
  const org = $("regOrg").value.trim();
  const title = $("regTitle").value.trim();
  const dateTime = $("regDate").value;
  const location = $("regLocation").value.trim();
  const borderColor = $("regColor").value;

  if (!org || !title) {
    $("registerModalError").textContent = "담당 기관과 연수명은 필수입니다.";
    $("registerModalError").classList.add("show");
    return;
  }

  try {
    if (id) {
      await updateDoc(doc(db, "registers", id), { org, title, dateTime, location, borderColor });
      showToast("수정 완료");
    } else {
      await addDoc(collection(db, "registers"), {
        org, title, dateTime, location, borderColor,
        ownerUid: currentUser.uid,
        createdAt: serverTimestamp()
      });
      showToast("등록부가 생성되었습니다");
    }
    closeModal("registerModalBackdrop");
    loadRegisters();
  } catch (err) {
    $("registerModalError").textContent = "저장 실패: " + err.message;
    $("registerModalError").classList.add("show");
  }
});

async function deleteRegister(r) {
  if (!confirm(`"${r.title}" 등록부와 모든 참석자 정보를 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)) return;
  try {
    // 하위 컬렉션(preList, attendees) 문서도 함께 삭제
    for (const sub of ["preList", "attendees"]) {
      const snap = await getDocs(collection(db, "registers", r.id, sub));
      const batch = writeBatch(db);
      snap.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    await deleteDoc(doc(db, "registers", r.id));
    showToast("삭제되었습니다");
    loadRegisters();
  } catch (err) {
    showToast("삭제 실패: " + err.message);
  }
}

/* ---------------- pre-list (사전 명단) ---------------- */

function openPreListModal(r) {
  $("preListRegisterId").value = r.id;
  $("preListTextarea").value = "";
  $("preListPreview").style.display = "none";
  $("preListPreview").innerHTML = "";
  openModal("preListModalBackdrop");
}

function parsePreListText(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\t|,/).map((p) => p.trim());
      return { position: parts[0] || "", name: parts[1] || "" };
    })
    .filter((p) => p.name);
}

$("preListTextarea").addEventListener("input", (e) => {
  const rows = parsePreListText(e.target.value);
  const preview = $("preListPreview");
  if (!rows.length) { preview.style.display = "none"; return; }
  preview.style.display = "block";
  preview.innerHTML = `
    <table>
      <thead><tr><th>직위</th><th>성명</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${escapeHtml(r.position)}</td><td>${escapeHtml(r.name)}</td></tr>`).join("")}</tbody>
    </table>
  `;
});

$("savePreListBtn").addEventListener("click", async () => {
  const registerId = $("preListRegisterId").value;
  const rows = parsePreListText($("preListTextarea").value);
  if (!rows.length) { showToast("입력된 명단이 없습니다"); return; }

  try {
    // 기존 명단 삭제 후 새로 저장 (교체)
    const existing = await getDocs(collection(db, "registers", registerId, "preList"));
    const delBatch = writeBatch(db);
    existing.forEach((d) => delBatch.delete(d.ref));
    await delBatch.commit();

    const addBatch = writeBatch(db);
    rows.forEach((row) => {
      const ref = doc(collection(db, "registers", registerId, "preList"));
      addBatch.set(ref, { ...row, matched: false });
    });
    await addBatch.commit();

    showToast(`${rows.length}명의 명단이 저장되었습니다`);
    closeModal("preListModalBackdrop");
  } catch (err) {
    showToast("저장 실패: " + err.message);
  }
});

/* ---------------- QR ---------------- */

function openQrModal(r) {
  const link = `${BASE_URL}sign.html?id=${r.id}`;
  $("qrLinkInput").value = link;
  const qrEl = $("qrcode");
  qrEl.innerHTML = "";
  new QRCode(qrEl, { text: link, width: 220, height: 220 });
  activeRegisterId = r.id;
  openModal("qrModalBackdrop");
}

$("copyLinkBtn").addEventListener("click", () => {
  $("qrLinkInput").select();
  document.execCommand("copy");
  showToast("링크가 복사되었습니다");
});

$("downloadQrBtn").addEventListener("click", () => {
  const canvas = document.querySelector("#qrcode canvas");
  if (!canvas) return;
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `qr-${activeRegisterId}.png`;
  a.click();
});

/* ---------------- attendees / PDF ---------------- */

// 출력물에서 직위 순서를 이 배열 순서대로 고정합니다. 필요하면 이 목록만 바꾸면 돼요.
const POSITION_ORDER = [
  "교장", "교감", "수석교사", "교사",
  "교무행정사", "전문상담사", "원어민교사",
  "행정실장", "행정과장", "행정계장", "주무관"
];
function positionRank(position) {
  const idx = POSITION_ORDER.indexOf((position || "").trim());
  return idx === -1 ? POSITION_ORDER.length : idx;
}
function sortAttendeesForOutput(rows) {
  return [...rows].sort((a, b) => {
    const ra = positionRank(a.position), rb = positionRank(b.position);
    if (ra !== rb) return ra - rb;
    return (a.name || "").localeCompare(b.name || "", "ko");
  });
}

async function openAttendeeModal(r) {
  activeRegisterId = r.id;
  $("attendeeModalTitle").textContent = `📋 ${r.title} — 참석자 명단`;
  const tbody = $("attendeeTbody");
  tbody.innerHTML = `<tr><td colspan="4">불러오는 중...</td></tr>`;
  openModal("attendeeModalBackdrop");

  const [attendeeSnap, preListSnap] = await Promise.all([
    getDocs(collection(db, "registers", r.id, "attendees")),
    getDocs(collection(db, "registers", r.id, "preList")),
  ]);
  const attendees = attendeeSnap.docs.map((d) => d.data());
  const preList = preListSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // preList의 각 사람마다 서명 기록이 있으면 붙이고, 없으면 서명 없이 표시
  const attendeeByPreListId = new Map();
  attendees.forEach((a) => { if (a.preListId) attendeeByPreListId.set(a.preListId, a); });

  const fromPreList = preList.map((p) => {
    const matchedAttendee = attendeeByPreListId.get(p.id);
    return {
      position: p.position,
      name: p.name,
      signature: matchedAttendee ? matchedAttendee.signature : null,
      signed: !!matchedAttendee,
    };
  });
  // 명단에는 없지만 '직접 입력'으로 서명한 사람들도 함께 표시
  const manualExtras = attendees
    .filter((a) => !a.preListId)
    .map((a) => ({ position: a.position, name: a.name, signature: a.signature, signed: true }));

  const rows = sortAttendeesForOutput([...fromPreList, ...manualExtras]);
  const signedCount = rows.filter((a) => a.signed).length;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="4">등록된 명단이 없습니다.</td></tr>`;
  } else {
    tbody.innerHTML = rows.map((a, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(a.position)}</td>
        <td class="name-cell">${escapeHtml(a.name)}</td>
        <td>${a.signature ? `<img class="sig-thumb" src="${a.signature}">` : '<span class="no-sig">미서명</span>'}</td>
      </tr>
    `).join("");
  }

  // 인쇄용 데이터 준비 (여러 단으로 나눠 한 페이지에 담기)
  $("printTitle").textContent = r.title || "";
  $("printMeta").textContent = `${r.org || ""}  |  ${fmtDateTime(r.dateTime)}  |  ${r.location || ""}  |  총 ${rows.length}명 (서명 ${signedCount}명)`;

  const numCols = rows.length > 70 ? 3 : rows.length > 25 ? 2 : 1;
  const perCol = Math.max(1, Math.ceil(rows.length / numCols));
  const colsHtml = [];
  for (let c = 0; c < numCols; c++) {
    const colRows = rows.slice(c * perCol, (c + 1) * perCol);
    const startIdx = c * perCol;
    const rowsHtml = colRows.map((a, i) => `
      <tr>
        <td>${startIdx + i + 1}</td>
        <td>${escapeHtml(a.position)}</td>
        <td class="name-cell">${escapeHtml(a.name)}</td>
        <td>${a.signature ? `<img class="sig-thumb-print" src="${a.signature}">` : ""}</td>
      </tr>
    `).join("");
    colsHtml.push(`
      <table class="print-mini-table">
        <thead><tr><th>순</th><th>직위</th><th>성명</th><th>서명</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    `);
  }
  const printColumnsEl = $("printColumns");
  printColumnsEl.className = `print-columns cols-${numCols}`;
  printColumnsEl.innerHTML = colsHtml.join("");
}

$("printBtn").addEventListener("click", () => {
  window.print();
});
