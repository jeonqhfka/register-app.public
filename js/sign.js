<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>연수등록부 서명</title>
<link rel="stylesheet" href="css/style.css">
<style>
  .sign-shell {
    max-width: 460px;
    margin: 0 auto;
    padding: 24px 18px 60px;
  }
  .sign-card {
    background: #fff;
    border: 1px solid var(--line);
    border-top-width: 8px;
    border-radius: 10px;
    padding: 22px 20px;
    box-shadow: var(--shadow);
  }
  .sign-card h1 { font-size: 19px; margin: 0 0 6px; }
  .sign-meta { font-size: 13.5px; color: var(--muted); margin-bottom: 20px; line-height: 1.7; }
  .sign-meta div { display: flex; gap: 6px; }

  /* 명단 선택 단계 */
  .pick-search {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
    margin-bottom: 14px;
  }
  .pick-search input {
    flex: 1;
    border: none;
    outline: none;
    font-size: 15px;
  }
  .pick-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 50vh;
    overflow-y: auto;
  }
  .pick-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 13px 14px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: #fff;
  }
  .pick-item:active { background: #F0F2F5; }
  .pick-item .name { font-weight: 700; font-size: 15.5px; }
  .pick-item .position { font-size: 12.5px; color: var(--muted); margin-top: 2px; }
  .pick-item .arrow { color: var(--muted); font-size: 18px; }
  .pick-empty {
    text-align: center;
    color: var(--muted);
    font-size: 13.5px;
    padding: 30px 10px;
  }
  .manual-link {
    text-align: center;
    margin-top: 16px;
    font-size: 13px;
  }

  /* 서명 단계 */
  .selected-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--primary-tint);
    border-radius: 8px;
    padding: 12px 14px;
    margin-bottom: 18px;
  }
  .selected-banner .who { font-weight: 700; font-size: 15.5px; }
  .selected-banner .role { font-size: 12.5px; color: var(--muted); }

  .sig-label-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }
  .sig-label-row label { font-size: 13px; font-weight: 600; color: var(--muted); }

  #sigCanvas {
    width: 100%;
    height: 160px;
    border: 1.5px dashed var(--line);
    border-radius: 8px;
    touch-action: none;
    background: #FBFBFC;
  }

  .back-link {
    display: inline-block;
    margin-bottom: 14px;
    font-size: 13px;
    color: var(--muted);
  }

  .done-wrap {
    text-align: center;
    padding: 40px 10px;
  }
  .done-wrap .check {
    width: 60px; height: 60px;
    border-radius: 50%;
    background: var(--success);
    color: #fff;
    font-size: 30px;
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto 16px;
  }
</style>
</head>
<body>

<div class="sign-shell">
  <div id="loadingState" style="text-align:center; padding:60px 10px; color:var(--muted);">불러오는 중...</div>

  <div id="errorState" style="display:none; text-align:center; padding:60px 10px; color:var(--muted);">
    <h3 style="color:var(--ink)">등록부를 찾을 수 없습니다</h3>
    <p>전달받은 QR 코드나 링크를 다시 확인해주세요.</p>
  </div>

  <!-- 1단계: 명단에서 본인 선택 -->
  <div id="pickCard" class="sign-card" style="display:none">
    <h1 id="regTitle"></h1>
    <div class="sign-meta">
      <div>🗓 <span id="regDate"></span></div>
      <div>📍 <span id="regLocation"></span></div>
    </div>

    <div class="pick-search">
      🔍 <input type="text" id="pickSearch" placeholder="이름으로 검색">
    </div>
    <div class="pick-list" id="pickList"></div>
    <div class="pick-empty" id="pickEmpty" style="display:none">명단에서 이름을 찾을 수 없습니다.</div>

    <div class="manual-link">
      명단에 이름이 없으신가요? <a href="#" id="manualEntryLink">직접 입력하기</a>
    </div>
  </div>

  <!-- 2단계: 서명 -->
  <div id="signCard" class="sign-card" style="display:none">
    <a href="#" class="back-link" id="backToListLink">← 목록으로</a>

    <div class="selected-banner" id="selectedBanner" style="display:none">
      <div>
        <div class="who" id="selWhoName"></div>
        <div class="role" id="selWhoPosition"></div>
      </div>
      <div>✓</div>
    </div>

    <!-- 직접 입력일 때만 보이는 입력칸 -->
    <div id="manualFields" style="display:none">
      <div class="field-row">
        <div class="field">
          <label>직위</label>
          <input type="text" id="inPosition" placeholder="예: 교사">
        </div>
        <div class="field">
          <label>성명</label>
          <input type="text" id="inName" placeholder="예: 홍길동">
        </div>
      </div>
    </div>

    <div class="sig-label-row">
      <label>전자서명</label>
      <button type="button" class="btn btn-ghost btn-sm" id="clearSigBtn">지우기</button>
    </div>
    <canvas id="sigCanvas"></canvas>

    <div class="form-error" id="signError" style="margin-top:14px"></div>
    <button class="btn btn-primary btn-block" id="submitBtn" style="margin-top:16px">서명 완료</button>
  </div>

  <div id="doneCard" class="sign-card" style="display:none">
    <div class="done-wrap">
      <div class="check">✓</div>
      <h3>서명이 완료되었습니다</h3>
      <p style="color:var(--muted); font-size:13.5px;" id="doneSummary"></p>
    </div>
  </div>
</div>

<script type="module" src="js/sign.js"></script>
</body>
</html>
