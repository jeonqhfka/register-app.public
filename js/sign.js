import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getFirestore, doc, getDoc, updateDoc, collection, getDocs, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const $ = (id) => document.getElementById(id);

const params = new URLSearchParams(window.location.search);
const registerId = params.get("id");

let registerData = null;
let preListEntries = [];   // 아직 서명하지 않은 사람들 (로드 시점 기준)
let selected = null;       // { id, position, name } 또는 null(직접입력)
let hasDrawn = false;
let ctx, canvas, drawing = false, lastX = 0, lastY = 0;

/* ---------------- 초기 로드 ---------------- */

async function init() {
  if (!registerId) return showError();
  try {
    const snap = await getDoc(doc(db, "registers", registerId));
    if (!snap.exists()) return showError();
    registerData = snap.data();

    const preListSnap = await getDocs(collection(db, "registers", registerId, "preList"));
    preListEntries = preListSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((p) => !p.matched)
      .sort((a, b) => (a.name || "").localeCompare(b.name || "", "ko"));

    document.querySelectorAll(".sign-card").forEach((el) => {
      el.style.borderTopColor = registerData.borderColor || "#2B5FAD";
    });
    $("regTitle").textContent = registerData.title || "연수등록부";
    $("regDate").textContent = fmtDateTime(registerData.dateTime);
    $("regLocation").textContent = registerData.location || "미정";

    $("loadingState").style.display = "none";
    $("mainCard").style.display = "block";
  } catch (err) {
    console.error(err);
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

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

/* ---------------- 검색 & 선택 ---------------- */

function renderPickList(list, kw) {
  const wrap = $("pickList");
  wrap.innerHTML = "";

  if (!kw) {
    $("pickHint").style.display = "block";
    $("pickEmpty").style.display = "none";
    return;
  }
  $("pickHint").style.display = "none";
  $("pickEmpty").style.display = list.length ? "none" : "block";

  list.forEach((p) => {
    const item = document.createElement("div");
    item.className = "pick-item";
    item.innerHTML = `
      <div>
        <div class="name">${escapeHtml(p.name)}</div>
        <div class="position">${escapeHtml(p.position)}</div>
      </div>
      <div class="arrow">›</div>
    `;
    item.addEventListener("click", () => selectPerson(p));
    wrap.appendChild(item);
  });
}

$("pickSearch").addEventListener("input", (e) => {
  const kw = e.target.value.trim();
  if (!kw) { renderPickList([], ""); return; }
  const filtered = preListEntries.filter((p) => (p.name || "").includes(kw));
  renderPickList(filtered, kw);
});

$("manualEntryLink").addEventListener("click", (e) => {
  e.preventDefault();
  selected = null;
  openSignSection();
});

function selectPerson(p) {
  selected = p;
  openSignSection();
}

$("backToListLink").addEventListener("click", (e) => {
  e.preventDefault();
  $("signSection").style.display = "none";
  $("searchSection").style.display = "block";
});

/* ---------------- 서명 영역 펼치기 ---------------- */

function openSignSection() {
  $("searchSection").style.display = "none";
  $("signSection").style.display = "block";

  if (selected) {
    $("manualFields").style.display = "none";
    $("selectedBanner").style.display = "flex";
    $("selWhoName").textContent = selected.name;
    $("selWhoPosition").textContent = selected.position || "";
  } else {
    $("manualFields").style.display = "block";
    $("selectedBanner").style.display = "none";
    $("inPosition").value = "";
    $("inName").value = "";
  }

  $("signSection").scrollIntoView({ behavior: "smooth", block: "start" });

  // 화면에 실제로 보이게 된 다음 프레임에 캔버스 크기를 잡아야
  // getBoundingClientRect가 올바른 값을 반환합니다.
  requestAnimationFrame(setupCanvas);
}

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
  hasDrawn = false;

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

  canvas.onmousedown = start;
  canvas.onmousemove = move;
  window.onmouseup = end;
  canvas.ontouchstart = start;
  canvas.ontouchmove = move;
  canvas.ontouchend = end;
}

$("clearSigBtn").addEventListener("click", () => {
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  hasDrawn = false;
});

/* ---------------- 제출 (제출 직전 중복서명 재확인) ---------------- */

$("submitBtn").addEventListener("click", async () => {
  const errEl = $("signError");
  errEl.classList.remove("show");

  let position, name, preListId = null;
  if (selected) {
    position = selected.position || "";
    name = selected.name || "";
    preListId = selected.id;
  } else {
    position = $("inPosition").value.trim();
    name = $("inName").value.trim();
    if (!position || !name) {
      errEl.textContent = "직위와 성명을 입력해주세요.";
      errEl.classList.add("show");
      return;
    }
  }

  if (!hasDrawn) {
    errEl.textContent = "서명란에 서명을 남겨주세요.";
    errEl.classList.add("show");
    return;
  }

  $("submitBtn").disabled = true;
  $("submitBtn").textContent = "확인 중...";

  try {
    // 명단에서 고른 경우, 그 사이에 다른 기기로 이미 서명했는지 서버에서 다시 확인
    if (preListId) {
      const freshSnap = await getDoc(doc(db, "registers", registerId, "preList", preListId));
      if (freshSnap.exists() && freshSnap.data().matched) {
        errEl.textContent = "이미 서명이 완료된 참석자입니다. 다른 사람인가요? 목록으로 돌아가 확인해주세요.";
        errEl.classList.add("show");
        $("submitBtn").disabled = false;
        $("submitBtn").textContent = "서명 완료";
        return;
      }
    }

    $("submitBtn").textContent = "제출 중...";
    const signatureDataUrl = canvas.toDataURL("image/png");
    await addDoc(collection(db, "registers", registerId, "attendees"), {
      position, name,
      signature: signatureDataUrl,
      matched: !!preListId,
      preListId,
      signedAt: serverTimestamp()
    });

    if (preListId) {
      try {
        await updateDoc(doc(db, "registers", registerId, "preList", preListId), { matched: true });
      } catch (e) {
        // 표시 실패해도 서명 자체는 이미 저장됐으므로 무시
      }
      // 로컬 목록에서도 제거해 같은 세션에서 재검색해도 다시 안 나오게 함
      preListEntries = preListEntries.filter((p) => p.id !== preListId);
    }

    $("mainCard").style.display = "none";
    $("doneCard").style.display = "block";
    $("doneSummary").textContent = `${registerData.title || ""} — ${position} ${name}님`;
  } catch (err) {
    errEl.textContent = "제출에 실패했습니다. 네트워크를 확인 후 다시 시도해주세요.";
    errEl.classList.add("show");
    $("submitBtn").disabled = false;
    $("submitBtn").textContent = "서명 완료";
  }
});

init();
