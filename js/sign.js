import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getFirestore, doc, getDoc, collection, query, where, getDocs, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const $ = (id) => document.getElementById(id);

const params = new URLSearchParams(window.location.search);
const registerId = params.get("id");

let registerData = null;
let matchedPreListDoc = null; // {id, org, position, name}
let hasDrawn = false;

/* ---------------- load register ---------------- */

async function init() {
  if (!registerId) return showError();
  try {
    const snap = await getDoc(doc(db, "registers", registerId));
    if (!snap.exists()) return showError();
    registerData = snap.data();
    renderRegisterInfo();
    setupCanvas();
    $("loadingState").style.display = "none";
    $("signCard").style.display = "block";
  } catch (err) {
    showError();
  }
}

function showError() {
  $("loadingState").style.display = "none";
  $("errorState").style.display = "block";
}

function fmtDateTime(iso) {
  if (!iso) return "미정";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString("ko-KR", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit"
  });
}

function renderRegisterInfo() {
  document.querySelector(".sign-card").style.borderTopColor = registerData.borderColor || "#2B5FAD";
  $("regTitle").textContent = registerData.title || "연수등록부";
  $("regDate").textContent = fmtDateTime(registerData.dateTime);
  $("regLocation").textContent = registerData.location || "미정";
  $("regOrg").textContent = registerData.org || "-";
}

/* ---------------- pre-list matching ---------------- */

let matchTimer = null;
$("inName").addEventListener("input", () => {
  clearTimeout(matchTimer);
  matchTimer = setTimeout(tryMatchPreList, 350);
});

async function tryMatchPreList() {
  const name = $("inName").value.trim();
  matchedPreListDoc = null;
  const hint = $("matchHint");
  if (!name) { hint.textContent = ""; hint.className = "match-hint"; return; }

  try {
    const q = query(collection(db, "registers", registerId, "preList"), where("name", "==", name));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const d = snap.docs[0];
      matchedPreListDoc = { id: d.id, ...d.data() };
      if (!$("inOrg").value) $("inOrg").value = matchedPreListDoc.org || "";
      if (!$("inPosition").value) $("inPosition").value = matchedPreListDoc.position || "";
      hint.textContent = "✓ 사전 명단에서 확인되었습니다";
      hint.className = "match-hint found";
    } else {
      hint.textContent = "";
      hint.className = "match-hint notfound";
    }
  } catch (err) {
    // 매칭 실패는 서명 자체를 막지 않음
    hint.textContent = "";
  }
}

/* ---------------- signature canvas ---------------- */

let ctx, canvas, drawing = false, lastX = 0, lastY = 0;

function setupCanvas() {
  canvas = $("sigCanvas");
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * ratio;
  canvas.height = rect.height * ratio;
  ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  ctx.strokeStyle = "#1B2430";

  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  };

  const start = (e) => {
    e.preventDefault();
    drawing = true;
    hasDrawn = true;
    const p = pos(e);
    lastX = p.x; lastY = p.y;
  };
  const move = (e) => {
    if (!drawing) return;
    e.preventDefault();
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastX = p.x; lastY = p.y;
  };
  const end = () => { drawing = false; };

  canvas.addEventListener("mousedown", start);
  canvas.addEventListener("mousemove", move);
  window.addEventListener("mouseup", end);
  canvas.addEventListener("touchstart", start, { passive: false });
  canvas.addEventListener("touchmove", move, { passive: false });
  canvas.addEventListener("touchend", end);
}

$("clearSigBtn").addEventListener("click", () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  hasDrawn = false;
});

/* ---------------- submit ---------------- */

$("submitBtn").addEventListener("click", async () => {
  const org = $("inOrg").value.trim();
  const position = $("inPosition").value.trim();
  const name = $("inName").value.trim();
  const errEl = $("signError");
  errEl.classList.remove("show");

  if (!org || !position || !name) {
    errEl.textContent = "소속, 직위, 성명을 모두 입력해주세요.";
    errEl.classList.add("show");
    return;
  }
  if (!hasDrawn) {
    errEl.textContent = "서명란에 서명을 남겨주세요.";
    errEl.classList.add("show");
    return;
  }

  $("submitBtn").disabled = true;
  $("submitBtn").textContent = "제출 중...";

  try {
    const signatureDataUrl = canvas.toDataURL("image/png");
    await addDoc(collection(db, "registers", registerId, "attendees"), {
      org, position, name,
      signature: signatureDataUrl,
      matched: !!matchedPreListDoc,
      preListId: matchedPreListDoc ? matchedPreListDoc.id : null,
      signedAt: serverTimestamp()
    });

    $("signCard").style.display = "none";
    $("doneCard").style.display = "block";
    $("doneSummary").textContent = `${registerData.title || ""} — ${org} ${position} ${name}님`;
  } catch (err) {
    errEl.textContent = "제출에 실패했습니다. 네트워크를 확인 후 다시 시도해주세요.";
    errEl.classList.add("show");
    $("submitBtn").disabled = false;
    $("submitBtn").textContent = "서명 완료";
  }
});

init();
