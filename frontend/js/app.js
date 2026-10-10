/* ============================================================
   1. CONFIG
   ============================================================ */
const SUPABASE_URL = "https://ptmznpjsgdkasvywufcx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB0bXpucGpzZ2RrYXN2eXd1ZmN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg3NDcwODIsImV4cCI6MjEwNDMyMzA4Mn0.eonbgECAHUqIRMHd-UaDRdho3FZbzj2fABFNl75npNg";
const CONTACT_WHATSAPP = "254700000000"; // your real WhatsApp number — replace before going live
const IS_NETLIFY_PREVIEW = location.hostname.includes("--reviewtapoperate.netlify.app") || location.hostname.startsWith("deploy-preview-");
function blockPreviewWrite(message = "This action is disabled in the verification preview. Use a separate staging database for functional testing.") {
  if (!IS_NETLIFY_PREVIEW) return false;
  toast(message);
  return true;
}
function renderPreviewAccessNotice(message) {
  app.innerHTML = `<div class="center-screen"><div class="wrap" style="max-width:420px;"><div class="brand"><div class="mark">RTO</div><span>ReviewTapOperate</span></div><div class="card"><h2 style="margin-top:0;">Verification preview</h2><p class="hint" style="font-size:13px;color:var(--text);">${esc(message)}</p><p class="hint">This preview is connected to the production Supabase project. Privileged screens are disabled here to prevent accidental production changes.</p><a class="btn" href="/">Return to preview home</a></div></div></div>`;
}

const configured = SUPABASE_URL !== "YOUR_SUPABASE_URL" && SUPABASE_ANON_KEY !== "YOUR_SUPABASE_ANON_KEY";
let libsLoaded = true;
let sb = null;
if (configured) {
  if (typeof supabase === "undefined" || !supabase.createClient) {
    libsLoaded = false;
  } else {
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
}
const BUCKET = "rto-photos";

const app = document.getElementById("app");
const params = new URLSearchParams(window.location.search);
const slug = params.get("c");
const editSlug = params.get("edit");

async function rtoApi(action, payload = {}) {
  const response = await fetch("/.netlify/functions/rto-api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ action, ...payload })
  });
  let result = {};
  try { result = await response.json(); } catch {}
  if (!response.ok) throw new Error(result.error || "The request could not be completed.");
  return result;
}
async function rtoLogout() {
  try { await rtoApi("logout"); } catch {}
  sessionStorage.removeItem("rto_admin");
  clearMemberSession();
}
function toast(msg){
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2400);
}
function esc(s){ return (s||"").toString().replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m])); }

/* Every business gets its own real page title and description instead of
   the site's generic one — this is what shows up in a Google search
   result and in the browser tab, and it was completely missing before. */
function setPageSeoTags(c){
  const titleParts = [c.name];
  if (c.title) titleParts.push(c.title);
  titleParts.push("ReviewTapOperate");
  document.title = titleParts.join(" — ");

  const descBits = [];
  if (c.title) descBits.push(c.title);
  if (c.address) descBits.push(c.address);
  if (c.menu_items && c.menu_items.length) descBits.push(c.menu_items.slice(0,3).map(m => m.name).join(", "));
  const description = (c.name + (descBits.length ? " — " + descBits.join(" · ") : " — find contact info, reviews, and more.")).slice(0, 160);

  let metaTag = document.querySelector('meta[name="description"]');
  if (!metaTag) {
    metaTag = document.createElement("meta");
    metaTag.setAttribute("name", "description");
    document.head.appendChild(metaTag);
  }
  metaTag.setAttribute("content", description);
}
function digits(v){ return (v||"").replace(/[^\d+]/g,""); }
function initials(name){ return (name||"?").split(" ").filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join(""); }
function tapLink(s){ return window.location.origin + window.location.pathname + "?c=" + s; }

/* ============================================================
   MEMBER ACCOUNTS — real end-customer accounts (the people tapping
   cards), separate from business owners and admin. Same lightweight
   access-code pattern as businesses: no password, no email needed.
   ============================================================ */
function getMemberSession(){
  try { return JSON.parse(sessionStorage.getItem("rto_member") || "null"); } catch(e) { return null; }
}
function setMemberSession(m){ sessionStorage.setItem("rto_member", JSON.stringify(m)); }
function clearMemberSession(){ sessionStorage.removeItem("rto_member"); }

function showMemberAuthModal(onSuccess){
  const old = document.getElementById("memberAuthModal");
  if (old) old.remove();
  document.body.insertAdjacentHTML("beforeend", `
    <div class="modal-bg" id="memberAuthModal" onclick="if(event.target.id==='memberAuthModal') closeMemberAuthModal()">
      <div class="modal">
        <div id="memberAuthBody"></div>
      </div>
    </div>`);
  renderMemberAuthTab("signup");
  window.__memberAuthSuccessCb = onSuccess;
}
function renderMemberAuthTab(tab){
  const body = document.getElementById("memberAuthBody");
  if (!body) return;
  if (tab === "login") {
    body.innerHTML = `
      <p style="font-weight:700;margin:0 0 4px;">Log in</p>
      <p class="hint" style="margin-bottom:14px;">Enter your phone number and access code.</p>
      <div class="field" style="text-align:left;"><label>Phone number</label><input id="ma_phone"></div>
      <div class="field" style="text-align:left;"><label>Access code</label><input id="ma_code" style="text-transform:uppercase;letter-spacing:2px;font-family:monospace;"></div>
      <button class="btn" onclick="doMemberLogin()">Log in</button>
      <button class="btn secondary" style="margin-top:8px;" onclick="renderMemberAuthTab('signup')">New here? Sign up instead</button>
      <button class="btn secondary" style="margin-top:8px;" onclick="closeMemberAuthModal()">Cancel</button>`;
  } else {
    body.innerHTML = `
      <p style="font-weight:700;margin:0 0 4px;">Quick sign up</p>
      <p class="hint" style="margin-bottom:14px;">Just your name and phone — takes seconds. We'll give you an access code to log back in anytime.</p>
      <div class="field" style="text-align:left;"><label>Your name</label><input id="ma_name"></div>
      <div class="field" style="text-align:left;"><label>Phone number</label><input id="ma_phone2"></div>
      <button class="btn" onclick="doMemberSignup()">Sign up</button>
      <button class="btn secondary" style="margin-top:8px;" onclick="renderMemberAuthTab('login')">Already have an account? Log in</button>
      <button class="btn secondary" style="margin-top:8px;" onclick="closeMemberAuthModal()">Cancel</button>`;
  }
}
async function doMemberSignup(){
  if (blockPreviewWrite("Member sign-up is disabled in the verification preview.")) return;
  const name = document.getElementById("ma_name").value.trim();
  const phone = document.getElementById("ma_phone2").value.trim();
  if (!name || !phone) { toast("Enter your name and phone"); return; }
  try {
    const result = await rtoApi("member-signup", { name, phone });
    setMemberSession(result.member);
    toast("Account created! Your access code is " + result.accessCode + " — save it.");
    closeMemberAuthModal();
    if (window.__memberAuthSuccessCb) window.__memberAuthSuccessCb();
  } catch (error) { toast(error.message || "Couldn't create account."); }
}
async function doMemberLogin(){
  if (blockPreviewWrite("Member sign-in is disabled in the verification preview.")) return;
  const phone = document.getElementById("ma_phone").value.trim();
  const code = document.getElementById("ma_code").value.trim().toUpperCase();
  if (!phone || !code) { toast("Enter your phone and access code"); return; }
  try {
    const result = await rtoApi("member-login", { phone, code });
    setMemberSession(result.member);
    toast("Welcome back, " + result.member.name);
    closeMemberAuthModal();
    if (window.__memberAuthSuccessCb) window.__memberAuthSuccessCb();
  } catch (error) { toast(error.message || "No match found — check your phone and code."); }
}
function closeMemberAuthModal(){ const m = document.getElementById("memberAuthModal"); if (m) m.remove(); }

/* ============================================================
   IN-APP REVIEWS — logged-in members only, one review per member
   per business (editable). Shown here and pulled into Compare.
   ============================================================ */
async function loadReviewsSection(slugValue){
  const holder = document.getElementById("reviewsSection");
  if (!holder) return;
  const { data, error } = await sb.from("reviews").select("*").eq("business_slug", slugValue).order("created_at", { ascending: false });
  if (!document.getElementById("reviewsSection")) return; // navigated away already
  if (error) { holder.innerHTML = `<p class="hint">Couldn't load reviews.</p>`; return; }
  const reviews = data || [];
  const avg = reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;
  const member = getMemberSession();
  const myReview = member ? reviews.find(r => r.member_id === member.id) : null;

  let html = "";
  if (reviews.length) {
    html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
      <span style="font-size:22px;font-weight:800;color:var(--pink);">${avg.toFixed(1)}</span>
      <span style="color:var(--pink);">${"&#9733;".repeat(Math.round(avg))}${"&#9734;".repeat(5 - Math.round(avg))}</span>
      <span class="hint" style="margin:0;">(${reviews.length} review${reviews.length === 1 ? "" : "s"})</span>
    </div>`;
    html += reviews.slice(0, 5).map(r => `
      <div style="background:var(--panel-2);border:1px solid var(--line);border-radius:11px;padding:12px 14px;margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;"><b style="font-size:13px;">${esc(r.member_name || "Anonymous")}</b><span style="color:var(--pink);font-size:12px;">${"&#9733;".repeat(r.rating)}</span></div>
        ${r.comment ? `<p style="font-size:13px;margin:6px 0 0;color:var(--text-dim);">${esc(r.comment)}</p>` : ""}
      </div>`).join("");
  } else {
    html += `<p class="hint" style="margin-bottom:14px;">No reviews yet — be the first.</p>`;
  }
  html += `<div id="reviewFormWrap"></div>`;
  holder.innerHTML = html;
  renderReviewForm(slugValue, myReview);
}
function renderReviewForm(slugValue, existing){
  const wrap = document.getElementById("reviewFormWrap");
  if (!wrap) return;
  const member = getMemberSession();
  if (!member) {
    wrap.innerHTML = `<button class="btn secondary" onclick="showMemberAuthModal(() => loadReviewsSection('${slugValue}'))">Sign in to leave a review</button>`;
    return;
  }
  window.__currentRating = existing ? existing.rating : 0;
  wrap.innerHTML = `
    <div style="background:var(--panel-2);border-radius:11px;padding:12px 14px;">
      <p style="font-size:12.5px;color:var(--text-dim);margin:0 0 8px;">${existing ? "Update your review" : "Leave a review, " + esc(member.name)}</p>
      <div id="starPicker" style="font-size:22px;color:var(--pink);cursor:pointer;margin-bottom:8px;"></div>
      <textarea id="reviewComment" placeholder="Optional comment" rows="2" style="width:100%;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:8px;color:var(--text);font-family:inherit;font-size:13px;">${esc(existing ? (existing.comment || "") : "")}</textarea>
      <button class="btn" style="margin-top:8px;" onclick="submitReview('${slugValue}')">${existing ? "Update review" : "Submit review"}</button>
    </div>`;
  renderStarPicker();
}
function renderStarPicker(){
  const el = document.getElementById("starPicker");
  if (!el) return;
  const r = window.__currentRating || 0;
  el.innerHTML = [1,2,3,4,5].map(i => `<span onclick="setRating(${i})">${i <= r ? "&#9733;" : "&#9734;"}</span>`).join("");
}
function setRating(i){ window.__currentRating = i; renderStarPicker(); }
async function submitReview(slugValue){
  if (blockPreviewWrite("Review submissions are disabled in the verification preview.")) return;

  const member = getMemberSession();
  if (!member) { toast("Please sign in first"); return; }
  const rating = window.__currentRating || 0;
  if (!rating) { toast("Pick a star rating"); return; }
  const comment = document.getElementById("reviewComment").value.trim();
  const { error } = await sb.from("reviews").upsert(
    { business_slug: slugValue, member_id: member.id, member_name: member.name, rating, comment },
    { onConflict: "business_slug,member_id" }
  );
  if (error) { toast("Couldn't submit: " + error.message); return; }
  toast("Review saved — thank you!");
  logEvent(slugValue, "click", "Submitted Review");
  loadReviewsSection(slugValue);
}

/* ============================================================
   BOOKINGS — requires a customer account first (this is the
   credibility/accountability step). A request lands in the
   business's real inbox AND opens WhatsApp for an instant heads-up.
   Confirmed bookings can be downloaded as a calendar file by
   either side.
   ============================================================ */
function startBookingFlow(el){
  const slugValue = el.dataset.slug;
  const businessName = el.dataset.name;
  const guidelines = el.dataset.guidelines;
  const member = getMemberSession();
  if (member) {
    showBookingForm(slugValue, businessName, guidelines);
  } else {
    showMemberAuthModal(() => showBookingForm(slugValue, businessName, guidelines));
  }
}
function showBookingForm(slugValue, businessName, guidelines){
  const member = getMemberSession();
  const old = document.getElementById("bookingModal");
  if (old) old.remove();
  document.body.insertAdjacentHTML("beforeend", `
    <div class="modal-bg" id="bookingModal" onclick="if(event.target.id==='bookingModal') closeBookingModal()">
      <div class="modal">
        <p style="font-weight:700;margin:0 0 4px;">Send a request</p>
        <p class="hint" style="margin-bottom:14px;">Sent straight to ${esc(businessName)} — they'll confirm with you directly. Works for an appointment, a product order, anything.</p>
        ${guidelines ? `
          <div style="background:var(--panel-2);border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:12px;text-align:left;">
            <p style="font-size:11.5px;color:var(--cyan);font-weight:700;margin:0 0 4px;">Guidelines from ${esc(businessName)}</p>
            <p style="font-size:12.5px;color:var(--text-dim);margin:0;white-space:pre-wrap;">${esc(guidelines)}</p>
          </div>
          <label style="display:flex;align-items:flex-start;gap:8px;text-align:left;font-size:12.5px;color:var(--text-dim);margin-bottom:14px;">
            <input type="checkbox" id="bk_agree" style="margin-top:2px;"> I've read and agree to the guidelines above.
          </label>` : ""}
        <div class="field" style="text-align:left;"><label>Your name</label><input id="bk_name" value="${esc(member ? member.name : "")}"></div>
        <div class="field" style="text-align:left;"><label>Phone number</label><input id="bk_phone" value="${esc(member ? member.phone : "")}"></div>
        <div class="field" style="text-align:left;"><label>What are you requesting?</label><input id="bk_item" placeholder="e.g. Haircut &amp; beard trim, or Red dress size M x2"></div>
        <div class="field" style="text-align:left;"><label>Preferred date (optional)</label><input id="bk_date" type="date"></div>
        <div class="field" style="text-align:left;"><label>Preferred time (optional, for appointments)</label><input id="bk_time" type="time"></div>
        <div class="field" style="text-align:left;"><label>Note (optional)</label><input id="bk_note" placeholder="Party size, delivery vs pickup, special request, etc."></div>
        <button class="btn" onclick="submitBooking('${slugValue}','${esc(businessName).replace(/'/g,"\\'")}', ${guidelines ? "true" : "false"})">Send request</button>
        <button class="btn secondary" style="margin-top:8px;" onclick="closeBookingModal()">Cancel</button>
      </div>
    </div>`);
}
async function submitBooking(slugValue, businessName, guidelinesRequired){
  if (blockPreviewWrite("Booking submissions are disabled in the verification preview.")) return;

  if (guidelinesRequired) {
    const agreeBox = document.getElementById("bk_agree");
    if (!agreeBox || !agreeBox.checked) { toast("Please confirm you've read the booking guidelines"); return; }
  }
  const name = document.getElementById("bk_name").value.trim();
  const phone = document.getElementById("bk_phone").value.trim();
  const item = document.getElementById("bk_item").value.trim();
  const date = document.getElementById("bk_date").value;
  const time = document.getElementById("bk_time").value;
  const note = document.getElementById("bk_note").value.trim();
  if (!name || !phone) { toast("Please enter your name and phone"); return; }

  const member = getMemberSession();
  const record = {
    business_slug: slugValue, member_id: member ? member.id : null,
    customer_name: name, customer_phone: phone, item_requested: item,
    preferred_date: date, preferred_time: time, note, status: "pending",
  };
  const { error } = await sb.from("bookings").insert(record);
  if (error) { toast("Couldn't send request: " + error.message); return; }

  logEvent(slugValue, "click", "Booking Request");
  closeBookingModal();
  toast("Request sent!");

  const waText = `Hi, I'd like to request: ${item || "a booking"}${date ? " on " + date : ""}${time ? " at " + time : ""}. Name: ${name}${note ? ". Note: " + note : ""}`;
  const { data: bizRow } = await sb.from("customers").select("whatsapp_number").eq("slug", slugValue).maybeSingle();
  if (bizRow && bizRow.whatsapp_number) {
    window.open(`https://wa.me/${digits(bizRow.whatsapp_number)}?text=${encodeURIComponent(waText)}`, "_blank");
  }
}
function closeBookingModal(){ const m = document.getElementById("bookingModal"); if (m) m.remove(); }

/* ---- Calendar export (.ics) for confirmed bookings, either side ---- */
function buildIcsForBooking(id, businessName, date, time, note){
  const dateDigits = (date || "").replace(/-/g, "");
  const timeDigits = (time || "").replace(":", "");
  if (!dateDigits) return null;
  let dtStart, dtEnd, allDay = false;
  if (timeDigits) {
    dtStart = `${dateDigits}T${timeDigits}00`;
    const [h, m] = time.split(":").map(Number);
    const endH = Math.min(h + 1, 23);
    dtEnd = `${dateDigits}T${String(endH).padStart(2,"0")}${String(m).padStart(2,"0")}00`;
  } else {
    allDay = true;
    dtStart = dateDigits;
    dtEnd = dateDigits;
  }
  return [
    "BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//ReviewTapOperate//EN","BEGIN:VEVENT",
    `UID:rto-booking-${id}@reviewtapoperate`,
    allDay ? `DTSTART;VALUE=DATE:${dtStart}` : `DTSTART:${dtStart}`,
    allDay ? `DTEND;VALUE=DATE:${dtEnd}` : `DTEND:${dtEnd}`,
    `SUMMARY:Booking at ${businessName}`,
    `DESCRIPTION:${(note || "").replace(/\r?\n/g, " ")}`,
    "END:VEVENT","END:VCALENDAR"
  ].join("\r\n");
}
function downloadIcsFromEl(el){
  const ics = buildIcsForBooking(el.dataset.id, el.dataset.name, el.dataset.date, el.dataset.time, el.dataset.note);
  if (!ics) { toast("No date set for this booking yet"); return; }
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `booking-${el.dataset.id}.ics`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

/* ---- Bookings inbox, used by both business owner and admin ---- */
function showBookingsInbox(slugValue, businessName){
  const old = document.getElementById("bookingsInboxModal");
  if (old) old.remove();
  document.body.insertAdjacentHTML("beforeend", `
    <div class="modal-bg" id="bookingsInboxModal" onclick="if(event.target.id==='bookingsInboxModal') closeBookingsInbox()">
      <div class="modal" style="text-align:left;max-width:420px;">
        <p style="font-weight:700;margin:0 0 12px;">${esc(businessName)} — bookings</p>
        <div id="bookingsInboxBody"><p class="hint">Loading…</p></div>
        <button class="btn secondary" style="margin-top:16px;" onclick="closeBookingsInbox()">Close</button>
      </div>
    </div>`);
  loadBookingsInbox(slugValue, businessName);
}
async function loadBookingsInbox(slugValue, businessName){
  if (IS_NETLIFY_PREVIEW) { renderPreviewAccessNotice("Booking inbox is disabled in this verification preview."); return; }

  const body = document.getElementById("bookingsInboxBody");
  const { data, error } = await sb.from("bookings").select("*").eq("business_slug", slugValue).order("created_at", { ascending: false });
  if (!body) return;
  if (error) { body.innerHTML = `<p class="hint">Couldn't load: ${esc(error.message)}</p>`; return; }
  if (!data.length) { body.innerHTML = `<p class="hint">No booking requests yet.</p>`; return; }
  body.innerHTML = data.map(b => `
    <div style="background:var(--panel-2);border-radius:10px;padding:10px 12px;margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;"><b style="font-size:13.5px;">${esc(b.customer_name)}</b><span style="font-size:11px;color:${b.status==='confirmed'?'#2ECC71':b.status==='declined'?'#FF6B6B':'var(--text-dim)'};text-transform:capitalize;">${esc(b.status)}</span></div>
      ${b.item_requested ? `<div style="font-size:12.5px;font-weight:600;color:var(--cyan);margin-top:3px;">${esc(b.item_requested)}</div>` : ""}
      <div class="hint" style="margin:2px 0;">${esc(b.customer_phone)} ${b.preferred_date ? "· " + esc(b.preferred_date) : ""} ${b.preferred_time ? "· " + esc(b.preferred_time) : ""}</div>
      ${b.note ? `<div class="hint" style="margin:2px 0;">${esc(b.note)}</div>` : ""}
      <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;">
        ${b.status !== "confirmed" ? `<button class="btn secondary" style="width:auto;padding:5px 10px;font-size:11.5px;" onclick="setBookingStatus(${b.id},'confirmed','${slugValue}','${esc(businessName).replace(/'/g,"\\'")}')">Confirm</button>` : ""}
        ${b.status !== "declined" ? `<button class="btn secondary" style="width:auto;padding:5px 10px;font-size:11.5px;" onclick="setBookingStatus(${b.id},'declined','${slugValue}','${esc(businessName).replace(/'/g,"\\'")}')">Decline</button>` : ""}
        ${b.status === "confirmed" ? `<button class="btn secondary" style="width:auto;padding:5px 10px;font-size:11.5px;" data-id="${b.id}" data-name="${esc(businessName)}" data-date="${esc(b.preferred_date||"")}" data-time="${esc(b.preferred_time||"")}" data-note="${esc(b.note||"")}" onclick="downloadIcsFromEl(this)">Add to Calendar</button>` : ""}
      </div>
    </div>`).join("");
}
async function setBookingStatus(id, status, slugValue, businessName){
  if (blockPreviewWrite("Booking changes are disabled in the verification preview.")) return;

  const { error } = await sb.from("bookings").update({ status }).eq("id", id);
  if (error) { toast("Couldn't update: " + error.message); return; }
  loadBookingsInbox(slugValue, businessName);
}
function closeBookingsInbox(){ const m = document.getElementById("bookingsInboxModal"); if (m) m.remove(); }

/* ============================================================
   MY ACCOUNT — a signed-in customer's own dashboard: their booking
   history across every business they've interacted with.
   ============================================================ */
function openMyAccount(){
  const member = getMemberSession();
  if (member) renderMyAccountPage(member);
  else showMemberAuthModal(() => renderMyAccountPage(getMemberSession()));
}
async function renderMyAccountPage(member){
  if (IS_NETLIFY_PREVIEW) { renderPreviewAccessNotice("Member account data is disabled in this verification preview."); return; }

  app.innerHTML = `
    <div class="wrap" style="max-width:460px;">
      <div class="top-bar">
        <div class="brand" style="margin:20px 0 0;"><div class="mark">RTO</div><span>ReviewTapOperate</span></div>
        <button class="icon-btn" title="Log out" onclick="clearMemberSession(); renderLanding('home')">&#8630;</button>
      </div>
      <div class="card" style="margin-top:16px;">
        <p style="font-weight:700;margin:0 0 4px;">Hi, ${esc(member.name)}</p>
        <p class="hint">Your booking requests across every business on RTO.</p>
      </div>
      <div id="myBookingsHolder" style="margin-top:16px;"><p class="muted">Loading…</p></div>
      <button class="btn secondary" style="margin-top:16px;" onclick="renderLanding('home')">Back to site</button>
    </div>`;
  const { data, error } = await sb.from("bookings").select("*, customers(name)").eq("member_id", member.id).order("created_at", { ascending: false });
  const holder = document.getElementById("myBookingsHolder");
  if (!holder) return;
  if (error) { holder.innerHTML = `<p class="muted">Couldn't load: ${esc(error.message)}</p>`; return; }
  if (!data.length) { holder.innerHTML = `<p class="muted" style="text-align:center;padding:20px 0;">No booking requests yet.</p>`; return; }
  holder.innerHTML = data.map(b => `
    <div class="row-item" style="margin-bottom:10px;flex-wrap:wrap;">
      <div>
        <div class="name">${esc((b.customers && b.customers.name) || "Business")}</div>
        <div class="hint">${b.preferred_date ? esc(b.preferred_date) : ""} ${b.preferred_time ? "· " + esc(b.preferred_time) : ""}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:11px;color:${b.status==='confirmed'?'#2ECC71':b.status==='declined'?'#FF6B6B':'var(--text-dim)'};text-transform:capitalize;">${esc(b.status)}</span>
        ${b.status === "confirmed" ? `<button class="btn secondary" style="width:auto;padding:5px 10px;font-size:11px;" data-id="${b.id}" data-name="${esc((b.customers && b.customers.name) || "Business")}" data-date="${esc(b.preferred_date||"")}" data-time="${esc(b.preferred_time||"")}" data-note="${esc(b.note||"")}" onclick="downloadIcsFromEl(this)">Add to Calendar</button>` : ""}
      </div>
    </div>`).join("");
}
function sharePage(el){
  const slugValue = el.dataset.slug;
  const name = el.dataset.name;
  const link = tapLink(slugValue);
  logEvent(slugValue, "click", "Share Page");
  if (navigator.share) {
    navigator.share({ title: name, text: `Check out ${name}`, url: link }).catch(() => { /* user cancelled, ignore */ });
  } else {
    navigator.clipboard.writeText(link);
    toast("Link copied — share it anywhere");
  }
}
function ownerLink(s){ return window.location.origin + window.location.pathname + "?edit=" + s; }
function slugify(v){ return v.toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"").slice(0,40); }
function generateOwnerCode(){
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I, avoids confusion
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}
function extractStoragePath(url){
  if (!url) return null;
  const marker = "/" + BUCKET + "/";
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}
async function deleteFromStorage(url){
  if (blockPreviewWrite("Image deletion is disabled in the verification preview.")) return;

  const path = extractStoragePath(url);
  if (!path) return;
  try { await sb.storage.from(BUCKET).remove([path]); } catch(e) { /* best-effort */ }
}

/* ============================================================
   THEMES — curated palettes only (deliberately not a raw colour
   picker, so nothing a client picks can come out ugly/unreadable)
   ============================================================ */
const THEMES = {
  neon:     { label:"Neon Signage (pink & cyan)",    bg:"#0A0A10", panel:"#14141C", panel2:"#1B1B25", pink:"#FF2E88", cyan:"#00E5FF" },
  golden:   { label:"Golden Hour (gold & teal)",      bg:"#12141C", panel:"#1B1E29", panel2:"#232734", pink:"#E8B84B", cyan:"#4FD1C5" },
  emerald:  { label:"Emerald Luxe (gold & emerald)",  bg:"#0A120E", panel:"#101C15", panel2:"#16261C", pink:"#D4AF37", cyan:"#2ECC71" },
  coral:    { label:"Coral Pop (coral & turquoise)",  bg:"#170F0C", panel:"#221410", panel2:"#2E1B15", pink:"#FF6B4A", cyan:"#2DD4BF" },
  mono:     { label:"Mono Ice (ice blue & silver)",   bg:"#08090B", panel:"#101214", panel2:"#171A1D", pink:"#9FD8FF", cyan:"#E7ECEF" },
  sapphire: { label:"Sapphire Trust (blue & silver)", bg:"#0A0F1C", panel:"#101828", panel2:"#16202F", pink:"#4A7FFF", cyan:"#C9D6E8" },
  rose:     { label:"Rose Boutique (rose & champagne)", bg:"#170F13", panel:"#211519", panel2:"#2C1B20", pink:"#FF8FAE", cyan:"#D4AF8C" },
  citrus:   { label:"Citrus Fresh (orange & lime)",   bg:"#0F1208", panel:"#171C0F", panel2:"#212714", pink:"#FF9B3D", cyan:"#B4E61D" },
  royal:    { label:"Royal Purple (violet & gold)",   bg:"#0F0A16", panel:"#170F20", panel2:"#201629", pink:"#B983FF", cyan:"#E8B84B" },
};
function applyTheme(id){
  const t = THEMES[id] || THEMES.neon;
  const r = document.documentElement.style;
  r.setProperty("--bg", t.bg);
  r.setProperty("--panel", t.panel);
  r.setProperty("--panel-2", t.panel2);
  r.setProperty("--pink", t.pink);
  r.setProperty("--cyan", t.cyan);
}
function themeOptions(selected){
  return Object.keys(THEMES).map(id => `<option value="${id}" ${id===(selected||"neon") ? "selected" : ""}>${esc(THEMES[id].label)}</option>`).join("");
}
function updateThemeSwatch(){
  const sel = document.getElementById("f_theme");
  const swatch = document.getElementById("themeSwatch");
  if (!sel || !swatch) return;
  const t = THEMES[sel.value] || THEMES.neon;
  swatch.innerHTML = `<span style="background:${t.pink};"></span><span style="background:${t.cyan};"></span>`;
}

/* ============================================================
   SOCIAL PLATFORMS — dropdown + unlimited rows
   ============================================================ */
const SOCIAL_PLATFORMS = [
  { id:"instagram", label:"Instagram",           mode:"handle", base:"https://instagram.com/",        badge:"IG",  placeholder:"yourhandle (no @)" },
  { id:"facebook",  label:"Facebook",            mode:"url",    base:"",                                badge:"FB",  placeholder:"https://facebook.com/yourpage" },
  { id:"tiktok",    label:"TikTok",              mode:"handle", base:"https://tiktok.com/@",           badge:"TT",  placeholder:"yourhandle (no @)" },
  { id:"twitter",   label:"X (Twitter)",         mode:"handle", base:"https://x.com/",                 badge:"X",   placeholder:"yourhandle (no @)" },
  { id:"youtube",   label:"YouTube",             mode:"url",    base:"",                                badge:"YT",  placeholder:"https://youtube.com/@yourchannel" },
  { id:"telegram",  label:"Telegram",            mode:"handle", base:"https://t.me/",                  badge:"TG",  placeholder:"yourhandle" },
  { id:"snapchat",  label:"Snapchat",            mode:"handle", base:"https://snapchat.com/add/",      badge:"SC",  placeholder:"yourhandle" },
  { id:"pinterest", label:"Pinterest",           mode:"url",    base:"",                                badge:"PN",  placeholder:"https://pinterest.com/yourprofile" },
  { id:"linkedin",  label:"LinkedIn",            mode:"handle", base:"https://linkedin.com/in/",       badge:"IN",  placeholder:"yourhandle" },
  { id:"custom",    label:"Other / custom link", mode:"url",    base:"",                                badge:"LNK", placeholder:"https://..." },
];
function socialMeta(id){ return SOCIAL_PLATFORMS.find(p => p.id === id) || SOCIAL_PLATFORMS[SOCIAL_PLATFORMS.length-1]; }
function socialUrl(platform, value){
  const meta = socialMeta(platform);
  if (!value) return "#";
  if (meta.mode === "handle") return meta.base + value.replace("@","").trim();
  let v = value.trim();
  if (!/^https?:\/\//i.test(v)) v = "https://" + v;
  return v;
}
function legacySocialSeed(existing){
  const seed = [];
  if (!existing) return seed;
  if (existing.instagram) seed.push({ platform:"instagram", value: existing.instagram });
  if (existing.linkedin) seed.push({ platform:"linkedin", value: existing.linkedin });
  return seed;
}

/* ============================================================
   ANALYTICS — logging + viewing. Visible only to admin (no
   extra password, already behind the master passcode) and to
   the business owner (already behind their own access code).
   Never shown anywhere on the public tap page.
   ============================================================ */
function logEvent(slugValue, type, label){
  if (IS_NETLIFY_PREVIEW) return;

  if (!sb) return;
  try { sb.from("page_events").insert({ slug: slugValue, event_type: type, link_label: label || null }); } catch(e) { /* best-effort, never blocks the visitor */ }
}
function renderAnalyticsModal(slugValue, name){
  const old = document.getElementById("analyticsModal");
  if (old) old.remove();
  document.body.insertAdjacentHTML("beforeend", `
    <div class="modal-bg" id="analyticsModal" onclick="if(event.target.id==='analyticsModal') closeAnalyticsModal()">
      <div class="modal" style="text-align:left;">
        <p style="font-weight:700;margin:0 0 12px;">${esc(name)} — analytics</p>
        <div id="analyticsBody"><p class="hint">Loading…</p></div>
        <button class="btn secondary" style="margin-top:16px;" onclick="closeAnalyticsModal()">Close</button>
      </div>
    </div>`);
  loadAnalyticsData(slugValue);
}
async function loadAnalyticsData(slugValue){
  if (IS_NETLIFY_PREVIEW) { const body = document.getElementById("analyticsBody"); if (body) body.innerHTML = "<p class=\"hint\">Analytics are disabled in this verification preview.</p>"; return; }

  const body = document.getElementById("analyticsBody");
  const { data, error } = await sb.from("page_events").select("event_type,link_label").eq("slug", slugValue);
  if (!body) return; // modal already closed
  if (error) { body.innerHTML = `<p class="hint">Couldn't load analytics: ${esc(error.message)}</p>`; return; }
  const views = data.filter(e => e.event_type === "view").length;
  const clicks = data.filter(e => e.event_type === "click");
  const counts = {};
  clicks.forEach(e => { const k = e.link_label || "Other"; counts[k] = (counts[k]||0) + 1; });
  const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]);
  let html = `<div style="font-size:14px;margin-bottom:12px;"><b>${views}</b> page views &nbsp;·&nbsp; <b>${clicks.length}</b> total clicks</div>`;
  if (sorted.length) {
    html += `<div style="display:flex;flex-direction:column;gap:6px;">` + sorted.map(([label,count]) => `
      <div style="display:flex;justify-content:space-between;background:var(--panel-2);border-radius:8px;padding:8px 12px;font-size:13px;">
        <span>${esc(label)}</span><span style="font-weight:700;color:var(--cyan);">${count}</span>
      </div>`).join("") + `</div>`;
  } else {
    html += `<p class="hint">No link clicks recorded yet.</p>`;
  }
  body.innerHTML = html;
}
function closeAnalyticsModal(){ const m = document.getElementById("analyticsModal"); if (m) m.remove(); }

/* ============================================================
   LIGHTBOX — click any uploaded photo to view full screen.
   Captions are collapsible (2-line preview, tap "more" to expand)
   so a long caption never covers the photo.
   ============================================================ */
function openLightbox(url, caption){
  if (!url) return;
  document.body.insertAdjacentHTML("beforeend", `
    <div class="lightbox-bg" id="lightboxModal" onclick="closeLightbox()">
      <div class="lightbox-media" onclick="event.stopPropagation()">
        <img src="${esc(url)}" onclick="closeLightbox()">
        ${caption ? `
          <div class="lightbox-caption" id="lightboxCaption">
            <div class="cap-text" id="lightboxCapText">${esc(caption)}</div>
            <button type="button" class="cap-toggle" id="lightboxCapBtn" onclick="toggleLightboxCaption()" style="display:none;">Show more</button>
          </div>` : ""}
      </div>
    </div>`);
  if (caption) {
    requestAnimationFrame(() => {
      const textEl = document.getElementById("lightboxCapText");
      const btn = document.getElementById("lightboxCapBtn");
      if (textEl && btn && textEl.scrollHeight > textEl.clientHeight + 2) {
        btn.style.display = "inline-block";
      }
    });
  }
}
function openLightboxFromEl(el){
  openLightbox(el.dataset.img, el.dataset.caption);
}
function toggleLightboxCaption(){
  const el = document.getElementById("lightboxCaption");
  const btn = document.getElementById("lightboxCapBtn");
  if (!el || !btn) return;
  const expanded = el.classList.toggle("expanded");
  btn.textContent = expanded ? "Show less" : "Show more";
}
function closeLightbox(){ const m = document.getElementById("lightboxModal"); if (m) m.remove(); }

/* ============================================================
   ROUTING
   ============================================================ */
try {
  if (!libsLoaded) {
    renderLibraryLoadError();
  } else if (!configured) {
    renderSetupNeeded();
  } else if (slug) {
    renderPublicProfile(slug);
  } else if (editSlug) {
    renderOwnerGate(editSlug);
  } else if (sessionStorage.getItem("rto_admin") === "1") {
    renderDashboard();
  } else {
    renderLanding("home");
  }
} catch (err) {
  app.innerHTML = `
    <div class="center-screen"><div class="wrap" style="max-width:420px;text-align:center;">
      <div class="brand" style="justify-content:center;"><div class="mark">RTO</div><span>ReviewTapOperate</span></div>
      <div class="setup-warning" style="text-align:left;">
        <b>Something went wrong loading the page.</b><br><br>
        ${esc(err.message || String(err))}
        <br><br>Try a hard refresh (or a private/incognito tab). If it keeps happening, copy this exact message and send it over.
      </div>
    </div></div>`;
}

function renderLibraryLoadError(){
  app.innerHTML = `
    <div class="center-screen"><div class="wrap" style="max-width:420px;text-align:center;">
      <div class="brand" style="justify-content:center;"><div class="mark">RTO</div><span>ReviewTapOperate</span></div>
      <div class="setup-warning" style="text-align:left;">
        <b>Couldn't load a required script.</b><br><br>
        This usually means your internet connection dropped mid-load, or an ad blocker / browser extension is blocking cdn.jsdelivr.net.
        Try refreshing, switching WiFi/data, or opening this link in a different browser.
      </div>
    </div></div>`;
}

/* ============================================================
   LANDING PAGE — the public homepage. Marketing + signup + login.
   Admin is reached only by triple-clicking the logo here, or by
   already having an active admin session.
   ============================================================ */
let logoClickCount = 0;
let logoClickTimer = null;
function handleLogoClick(){
  logoClickCount++;
  if (logoClickTimer) clearTimeout(logoClickTimer);
  logoClickTimer = setTimeout(() => { logoClickCount = 0; }, 1200);
  if (logoClickCount >= 3) {
    logoClickCount = 0;
    clearTimeout(logoClickTimer);
    renderAdminGate();
  }
}

function renderLanding(view){
  if (view === "signup") return renderSignupForm();
  if (view === "login") return renderLoginForm();
  if (view === "search") return renderSearchPage();

  app.innerHTML = `
    <div class="wrap" style="max-width:460px;">
      <div class="brand" style="margin-top:36px;cursor:pointer;user-select:none;" onclick="handleLogoClick()">
        <div class="mark">RTO</div><span>ReviewTapOperate</span>
      </div>

      <div style="text-align:center;margin:26px 0 30px;">
        <p class="p-name" style="font-size:34px;">Tap. They save you.</p>
        <p class="hint" style="font-size:14px;color:var(--text-dim);margin-top:8px;">
          One NFC card and QR code that puts your contact, socials, reviews, menu, and payment info in front of anyone in one tap — no app needed, editable anytime.
        </p>
      </div>

      <div class="btn-row" style="margin-top:0;">
        <button class="btn" onclick="renderLanding('signup')">Get started</button>
        <button class="btn secondary" onclick="renderLanding('login')">Business login</button>
        <button class="btn secondary" onclick="renderLanding('search')">Find a business</button>
        <button class="btn secondary" onclick="openMyAccount()">My account</button>
      </div>

      <div class="card" style="margin-top:28px;">
        <p style="font-weight:700;margin:0 0 12px;">What you get</p>
        <div style="display:flex;flex-direction:column;gap:10px;font-size:13.5px;color:var(--text-dim);">
          <div>&#10003; One tap saves your contact straight to their phone</div>
          <div>&#10003; Direct WhatsApp, Google review, and social links</div>
          <div>&#10003; Menu or price list, gallery, and till number on the same page</div>
          <div>&#10003; Edit anything yourself, anytime — no reprinting</div>
          <div>&#10003; Works with or without NFC, via QR code too</div>
        </div>
      </div>

      <div class="card" style="margin-top:16px;">
        <p style="font-weight:700;margin:0 0 12px;">Simple pricing</p>
        <div style="display:flex;justify-content:space-between;font-size:13.5px;margin-bottom:8px;">
          <span>Starter — one-time setup</span><span style="font-weight:700;color:var(--pink);">KES 5,000</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:13.5px;">
          <span>Business — setup + hosting</span><span style="font-weight:700;color:var(--cyan);">KES 5,000 + 500/mo</span>
        </div>
      </div>

      <a href="https://wa.me/${CONTACT_WHATSAPP}?text=${encodeURIComponent("Hi, I'd like to talk about getting a ReviewTapOperate page for my business")}" target="_blank" rel="noreferrer" class="btn" style="margin-top:16px;">Contact us on WhatsApp</a>

      <p class="footer-tag" style="margin-top:26px;">ReviewTapOperate</p>
    </div>`;
}

function renderSignupForm(){
  app.innerHTML = `
    <div class="wrap" style="max-width:400px;">
      <div class="brand" style="margin-top:36px;"><div class="mark">RTO</div><span>ReviewTapOperate</span></div>
      <div class="card" style="margin-top:20px;">
        <p style="font-weight:700;margin:0 0 4px;">Create your account</p>
        <p class="hint" style="margin-bottom:16px;">Takes under a minute. We'll generate your access code automatically — you'll land straight in your own page editor after this.</p>

        <div class="field"><label>Business / your name</label><input id="su_name" placeholder="e.g. Bright Salon"></div>
        <div class="field">
          <label>Business type</label>
          <select id="su_biztype">${bizTypeOptions("")}</select>
        </div>
        <div class="field"><label>Phone number</label><input id="su_phone" placeholder="+2547XXXXXXXX"></div>

        <button class="btn" id="suBtn" onclick="doSignup()">Create my account</button>
        <button class="btn secondary" style="margin-top:8px;" onclick="renderLanding('home')">Back</button>
      </div>
    </div>`;
}
async function resolveUniqueSlug(base){
  let candidate = base || "business";
  let suffix = 1;
  for (let i = 0; i < 20; i++) {
    const { data } = await sb.from("customers").select("slug").eq("slug", candidate).maybeSingle();
    if (!data) return candidate;
    suffix++;
    candidate = base + "-" + suffix;
  }
  return base + "-" + Date.now();
}
async function doSignup(){
  if (blockPreviewWrite("Creating business pages is disabled in the verification preview.")) return;
  const name = document.getElementById("su_name").value.trim();
  const bizType = document.getElementById("su_biztype").value;
  const phone = document.getElementById("su_phone").value.trim();
  if (!name || !bizType || !phone) { toast("Please fill in every field"); return; }
  const btn = document.getElementById("suBtn");
  btn.textContent = "Creating…"; btn.disabled = true;
  try {
    const baseSlug = slugify(name);
    const finalSlug = await resolveUniqueSlug(baseSlug);
    const result = await rtoApi("business-signup", { name, businessType: bizType, phone, slug: finalSlug });
    btn.textContent = "Create my account"; btn.disabled = false;
    renderSignupSuccess(result.customer);
  } catch (error) {
    btn.textContent = "Create my account"; btn.disabled = false;
    toast(error.message || "Couldn't create your account.");
  }
}
function renderSignupSuccess(record){
  window.__pendingSignupRecord = record;
  app.innerHTML = `
    <div class="wrap" style="max-width:400px;">
      <div class="brand" style="margin-top:36px;"><div class="mark">RTO</div><span>ReviewTapOperate</span></div>
      <div class="card" style="margin-top:20px;">
        <p style="font-weight:700;margin:0 0 4px;">You're in, ${esc(record.name)}</p>
        <p class="hint" style="margin-bottom:16px;">Save this access code somewhere safe — it's the only thing you need to log back in later. Anyone with this code can edit your page, so don't share it publicly.</p>

        <label style="text-align:left;display:block;">Your access code</label>
        <input readonly value="${esc(record.owner_code)}" style="font-family:monospace;font-weight:700;letter-spacing:2px;text-align:center;font-size:20px;" onclick="this.select()">
        <button class="btn secondary" style="margin-top:8px;" onclick="navigator.clipboard.writeText('${record.owner_code}');toast('Code copied')">Copy code</button>

        <button class="btn" style="margin-top:20px;" onclick="continueToOwnerEditor()">Continue to my page</button>
      </div>
    </div>`;
}
function continueToOwnerEditor(){
  currentMode = "owner";
  renderOwnerEditor(window.__pendingSignupRecord);
}

function renderLoginForm(){
  app.innerHTML = `
    <div class="wrap" style="max-width:380px;">
      <div class="brand" style="margin-top:36px;"><div class="mark">RTO</div><span>ReviewTapOperate</span></div>
      <div class="card" style="margin-top:20px;">
        <p style="font-weight:700;margin:0 0 4px;">Business login</p>
        <p class="hint" style="margin-bottom:16px;">Enter your access code — that's all you need.</p>
        <div class="field"><label>Access code</label><input id="li_code" style="text-align:center;letter-spacing:2px;font-family:monospace;text-transform:uppercase;" placeholder="e.g. K7P2QX"></div>
        <button class="btn" id="liBtn" onclick="doLogin()">Log in</button>
        <button class="btn secondary" style="margin-top:8px;" onclick="renderLanding('home')">Back</button>
      </div>
    </div>`;
  document.getElementById("li_code").addEventListener("keydown", e => { if(e.key==="Enter") doLogin(); });
}
async function doLogin(){
  if (blockPreviewWrite("Owner sign-in is disabled in the verification preview.")) return;

  const code = document.getElementById("li_code").value.trim().toUpperCase();
  if (!code) { toast("Enter your access code"); return; }

  const btn = document.getElementById("liBtn");
  btn.textContent = "Checking…"; btn.disabled = true;
  const { data, error } = await sb.from("customers").select("*").eq("owner_code", code).maybeSingle();
  btn.textContent = "Log in"; btn.disabled = false;

  if (error || !data) { toast("That access code doesn't match any account"); return; }

  currentMode = "owner";
  renderOwnerEditor(data);
}

/* ============================================================
   PUBLIC DIRECTORY — search by name, business type, or menu item.
   Only businesses with listed_in_directory = true appear here.
   Fetched once per session and cached; fine at current scale —
   revisit with a real search index once this is a large directory.
   ============================================================ */
let __searchCache = null;
let compareSelection = [];

function renderSearchPage(){
  compareSelection = [];
  app.innerHTML = `
    <div class="wrap" style="max-width:480px;">
      <div class="brand" style="margin-top:36px;cursor:pointer;user-select:none;" onclick="handleLogoClick()"><div class="mark">RTO</div><span>ReviewTapOperate</span></div>
      <div class="card" style="margin-top:20px;">
        <p style="font-weight:700;margin:0 0 4px;">Find a business</p>
        <p class="hint" style="margin-bottom:14px;">Search by name, business type, or even a specific menu item — e.g. "salon" or "nyama choma".</p>
        <input id="searchQuery" placeholder="Search..." onkeydown="if(event.key==='Enter') doSearch()">
        <button class="btn" style="margin-top:10px;" onclick="doSearch()">Search</button>
        <button class="btn secondary" style="margin-top:8px;" onclick="renderLanding('home')">Back</button>
      </div>
      <div id="searchResultsHolder" style="margin-top:20px;"></div>
      <div id="compareBar"></div>
    </div>`;
}

async function doSearch(){
  const q = document.getElementById("searchQuery").value.trim().toLowerCase();
  const holder = document.getElementById("searchResultsHolder");
  if (!q) { toast("Type something to search"); return; }
  holder.innerHTML = `<p class="muted">Searching…</p>`;

  if (!__searchCache) {
    const { data, error } = await sb.from("customers").select("*").eq("listed_in_directory", true);
    if (error) { holder.innerHTML = `<p class="muted">Couldn't search: ${esc(error.message)}</p>`; return; }
    __searchCache = data || [];
  }

  const matches = __searchCache.map(c => {
    const name = (c.name || "").toLowerCase();
    const type = (c.business_type || "").toLowerCase();
    const title = (c.title || "").toLowerCase();
    let matchNote = null;
    if (name.includes(q)) matchNote = "Name match";
    else if (type.includes(q) || title.includes(q)) matchNote = "Business type match";
    else if (c.menu_items && c.menu_items.length) {
      const item = c.menu_items.find(m => (m.name||"").toLowerCase().includes(q) || (m.category||"").toLowerCase().includes(q));
      if (item) matchNote = `Menu match: ${item.name}${item.price ? " — KES " + item.price : ""}`;
    }
    return matchNote ? { c, matchNote } : null;
  }).filter(Boolean);

  renderSearchResults(matches, q);
}

function renderSearchResults(matches, q){
  const holder = document.getElementById("searchResultsHolder");
  if (!matches.length) {
    holder.innerHTML = `<p class="muted" style="text-align:center;padding:20px 0;">No businesses found for "${esc(q)}".</p>`;
    return;
  }
  holder.innerHTML = matches.map(({ c, matchNote }) => {
    const isOpen = c.is_open !== false;
    const checked = compareSelection.includes(c.slug) ? "checked" : "";
    const typeLabel = (BIZ_TYPES.find(t => t.value === c.business_type) || {}).label || c.business_type || "";
    return `
    <div class="row-item" style="margin-bottom:10px;flex-wrap:wrap;">
      <div class="info">
        <div class="avatar">${c.photo_url ? `<img src="${esc(c.photo_url)}">` : initials(c.name)}</div>
        <div>
          <div class="name">${esc(c.name)}</div>
          <div class="slug">${esc(typeLabel)} · <span style="color:${isOpen ? "#2ECC71" : "#FF6B6B"};">${isOpen ? "Open" : "Closed"}</span></div>
          <div class="hint" style="margin-top:3px;">${esc(matchNote)}</div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
        <button class="btn secondary" style="width:auto;padding:7px 12px;font-size:12.5px;" onclick="window.open(tapLink('${c.slug}'),'_blank')">View page</button>
        <label style="display:flex;align-items:center;gap:5px;font-size:11.5px;color:var(--text-dim);cursor:pointer;">
          <input type="checkbox" ${checked} onchange="toggleCompare('${c.slug}', this.checked)"> Compare
        </label>
      </div>
    </div>`;
  }).join("");
  renderCompareBar();
}

function toggleCompare(slugValue, checked){
  if (checked) {
    if (compareSelection.length >= 3) { toast("You can compare up to 3 at a time"); return; }
    compareSelection.push(slugValue);
  } else {
    compareSelection = compareSelection.filter(s => s !== slugValue);
  }
  renderCompareBar();
}

function renderCompareBar(){
  const bar = document.getElementById("compareBar");
  if (!bar) return;
  bar.innerHTML = compareSelection.length >= 2
    ? `<button class="btn" style="margin-top:16px;" onclick="renderComparisonView()">Compare selected (${compareSelection.length})</button>`
    : "";
}

async function renderComparisonView(){
  const items = compareSelection.map(sl => __searchCache.find(c => c.slug === sl)).filter(Boolean);
  const allMenuNames = [...new Set(items.flatMap(c => (c.menu_items || []).map(m => m.name)))];
  const slugs = items.map(c => c.slug);
  const { data: allReviews } = await sb.from("reviews").select("business_slug,rating").in("business_slug", slugs);
  const ratingFor = (slug) => {
    const rows = (allReviews || []).filter(r => r.business_slug === slug);
    if (!rows.length) return "No reviews yet";
    const avg = rows.reduce((s,r) => s + r.rating, 0) / rows.length;
    return `${avg.toFixed(1)} &#9733; (${rows.length})`;
  };

  app.innerHTML = `
    <div class="wrap" style="max-width:600px;">
      <div class="brand" style="margin-top:36px;"><div class="mark">RTO</div><span>ReviewTapOperate</span></div>
      <div class="card" style="margin-top:20px;overflow-x:auto;">
        <p style="font-weight:700;margin:0 0 14px;">Comparing ${items.length} businesses</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr><td></td>${items.map(c => `<td style="padding:8px;text-align:center;font-weight:700;">${esc(c.name)}</td>`).join("")}</tr>
          <tr><td class="hint">Rating</td>${items.map(c => `<td style="text-align:center;padding:6px;color:var(--pink);">${ratingFor(c.slug)}</td>`).join("")}</tr>
          <tr><td class="hint">Type</td>${items.map(c => `<td style="text-align:center;padding:6px;">${esc((BIZ_TYPES.find(t=>t.value===c.business_type)||{}).label||"")}</td>`).join("")}</tr>
          <tr><td class="hint">Status</td>${items.map(c => `<td style="text-align:center;padding:6px;">${c.is_open !== false ? "Open" : "Closed"}</td>`).join("")}</tr>
          <tr><td class="hint">WhatsApp</td>${items.map(c => `<td style="text-align:center;padding:6px;">${c.whatsapp_number ? `<a href="https://wa.me/${digits(c.whatsapp_number)}" target="_blank" style="color:var(--cyan);">Chat</a>` : "—"}</td>`).join("")}</tr>
          <tr><td class="hint">Till</td>${items.map(c => `<td style="text-align:center;padding:6px;">${esc(c.till_number || "—")}</td>`).join("")}</tr>
          ${allMenuNames.map(itemName => `
            <tr><td class="hint">${esc(itemName)}</td>${items.map(c => {
              const m = (c.menu_items || []).find(x => x.name === itemName);
              return `<td style="text-align:center;padding:6px;">${m ? (m.price ? "KES " + esc(m.price) : "&#10003;") : "—"}</td>`;
            }).join("")}</tr>
          `).join("")}
        </table>
        <button class="btn secondary" style="margin-top:16px;" onclick="renderSearchPage()">Back to search</button>
      </div>
    </div>`;
}

function renderSetupNeeded(){
  app.innerHTML = `
    <div class="center-screen">
      <div class="wrap" style="max-width:420px;">
        <div class="brand"><div class="mark">RTO</div><span>ReviewTapOperate</span></div>
        <div class="setup-warning">
          <b>Setup needed.</b> Find SUPABASE_URL and SUPABASE_ANON_KEY near the top of the script and paste in your real values.
        </div>
      </div>
    </div>`;
}

/* ============================================================
   ADMIN — passcode gate. Reached only via triple-click on the
   landing page logo, or an already-active admin session.
   ============================================================ */
async function renderAdminGate(){
  if (IS_NETLIFY_PREVIEW) { renderPreviewAccessNotice("Administrative access is disabled in this verification preview."); return; }

  try { const auth = await rtoApi("session"); if (auth.authenticated && auth.session?.role === "admin") return renderDashboard(); } catch {}
  app.innerHTML = `
    <div class="center-screen">
      <div class="wrap" style="max-width:360px;">
        <div class="brand"><div class="mark">RTO</div><span>ReviewTapOperate</span></div>
        <div class="card">
          <label>Admin passcode</label>
          <input type="password" id="pass" placeholder="Enter passcode">
          <button class="btn" style="margin-top:14px;" onclick="checkPass()">Unlock</button>
        </div>
        <button class="btn secondary" style="margin-top:14px;" onclick="renderLanding('home')">Back to site</button>
      </div>
    </div>`;
  document.getElementById("pass").addEventListener("keydown", e => { if(e.key==="Enter") checkPass(); });
}
async function checkPass(){
  if (blockPreviewWrite("Admin access is disabled in this verification preview.")) return;
  const v = document.getElementById("pass").value;
  if (!v) { toast("Enter the admin passcode"); return; }
  try {
    await rtoApi("admin-login", { password: v });
    sessionStorage.setItem("rto_admin","1");
    renderDashboard();
  } catch (error) { toast(error.message || "Admin sign-in failed."); }
}

/* ============================================================
   ADMIN — dashboard
   ============================================================ */
async function renderDashboard(){
  if (IS_NETLIFY_PREVIEW) { renderPreviewAccessNotice("Administrative dashboard is disabled in this verification preview."); return; }

  currentMode = "admin";
  app.innerHTML = `
    <div class="wrap">
      <div class="top-bar">
        <div class="brand" style="margin:0;"><div class="mark">RTO</div><span>ReviewTapOperate</span></div>
        <button class="icon-btn" title="Log out" onclick="rtoLogout(); renderLanding('home')">&#8630;</button>
      </div>
      <p class="muted" style="margin:0 0 18px;">Every customer's tap card, one dashboard. Works for any type of business.</p>
      <div class="btn-row" style="margin-top:0;">
        <button class="btn" onclick="showForm()">+ New customer</button>
      </div>
      <div id="formHolder"></div>
      <div id="listHolder" class="row-list"><p class="muted">Loading customers…</p></div>
    </div>`;
  loadCustomerList();
}

let __rtoCustomers = [];
async function loadCustomerList(){
  if (IS_NETLIFY_PREVIEW) { renderPreviewAccessNotice("Administrative customer data is disabled in this verification preview."); return; }

  const holder = document.getElementById("listHolder");
  const { data, error } = await sb.from("customers").select("*").order("created_at",{ascending:false});
  if (error) { holder.innerHTML = `<p class="muted">Couldn't load customers: ${esc(error.message)}</p>`; return; }
  __rtoCustomers = data;
  if (!data.length) { holder.innerHTML = `<p class="muted">No customers yet — add your first one above.</p>`; return; }
  holder.innerHTML = data.map(c => `
    <div class="row-item">
      <div class="info">
        <div class="avatar">${c.photo_url ? `<img src="${esc(c.photo_url)}">` : initials(c.name)}</div>
        <div>
          <div class="name">${esc(c.name)}</div>
          <div class="slug">?c=${esc(c.slug)}</div>
        </div>
      </div>
      <div style="display:flex;gap:2px;flex-wrap:wrap;">
        <button class="icon-btn" title="Preview" onclick="window.open(tapLink('${c.slug}'),'_blank')">&#128065;</button>
        <button class="icon-btn" title="Edit" onclick="editCustomer('${c.slug}')">&#9998;</button>
        <button class="icon-btn" title="Owner access" onclick="showOwnerAccessModal('${c.slug}')">&#128272;</button>
        <button class="icon-btn" title="Analytics" onclick="renderAnalyticsModal('${c.slug}','${esc(c.name).replace(/'/g,"\\'")}')">&#128202;</button>
        <button class="icon-btn" title="Bookings" onclick="showBookingsInbox('${c.slug}','${esc(c.name).replace(/'/g,"\\'")}')">&#128197;</button>
        <button class="icon-btn" title="Copy link" onclick="copyLink('${c.slug}')">&#128279;</button>
        <button class="icon-btn" title="QR code" onclick="showQr('${c.slug}','${esc(c.name).replace(/'/g,"\\'")}')">&#9642;</button>
        <button class="icon-btn" title="Delete customer" onclick="deleteCustomer('${c.slug}')">&#128465;</button>
      </div>
    </div>
  `).join("");
}
function copyLink(s){ navigator.clipboard.writeText(tapLink(s)); toast("Tap link copied"); }
async function deleteCustomer(s){
  if (blockPreviewWrite("Customer deletion is disabled in the verification preview.")) return;

  if (!confirm("Delete this customer's whole page? This can't be undone.")) return;
  const c = __rtoCustomers.find(x => x.slug === s);
  if (c) {
    if (c.photo_url) await deleteFromStorage(c.photo_url);
    if (c.background_url) await deleteFromStorage(c.background_url);
    if (c.menu_image_url) await deleteFromStorage(c.menu_image_url);
  }
  const { error } = await sb.from("customers").delete().eq("slug", s);
  if (error) toast("Couldn't delete: " + error.message);
  else { toast("Deleted"); loadCustomerList(); }
}

/* ---- New/edit customer form (shared between admin and owner) ---- */
let currentMode = "admin"; // "admin" or "owner" — controls what saveCustomer does afterward
let editingSlug = null;
let menuRows = [];
let portfolioRows = [];
let deletedPortfolioUrls = [];
let socialRows = [];
let existingRef = null;
let removeFlags = { photo:false, background:false, menu:false };

function editCustomer(slug){
  const c = __rtoCustomers.find(x => x.slug === slug);
  if (!c) { toast("Couldn't find that customer"); return; }
  showForm(c);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function initPortfolioRows(existing){
  deletedPortfolioUrls = [];
  const raw = (existing && existing.portfolio) ? existing.portfolio : [];
  portfolioRows = raw.map(item => {
    if (typeof item === "string") return { existingUrl: null, caption: item, newFile: null, fileName: "" };
    return { existingUrl: item.image_url || null, caption: item.caption || "", newFile: null, fileName: "" };
  });
}
function initSocialRows(existing){
  const raw = (existing && existing.social_links && existing.social_links.length) ? existing.social_links : legacySocialSeed(existing);
  socialRows = raw.map(r => ({ platform: r.platform, value: r.value }));
}

function customerFormFieldsHtml(c, existing){
  return `
      <div class="section-label">Basic info</div>
      <div class="field"><label>Full name / business name</label><input id="f_name" value="${esc(c.name||"")}" oninput="autoSlug()"></div>
      <div class="field">
        <label>Business type</label>
        <select id="f_biztype" onchange="onBizTypeChange()">
          ${bizTypeOptions(c.business_type)}
        </select>
        <div class="hint">This decides which sections show up below — e.g. Menu only appears for business types that typically need one.</div>
      </div>
      <div class="field">
        <label>Link ID (in URL)</label>
        <input id="f_slug" value="${esc(c.slug||"")}" ${existing ? "readonly style=\"opacity:0.6;\"" : ""}>
        <div class="hint">${existing ? "Can't be changed — changing it would break your existing NFC card and QR code." : "Auto-fills from the name. Letters, numbers, dashes only."}</div>
      </div>
      <div class="field"><label>Title / business type detail</label><input id="f_title" value="${esc(c.title||"")}" placeholder='e.g. "Founder, Bright Salon" or "Real Estate Agent"'></div>
      <div class="field">
        <label>Automatic schedule</label>
        <div style="display:flex;align-items:center;gap:12px;margin-top:6px;">
          <button type="button" id="f_schedule_switch" class="toggle-switch ${(c.schedule && c.schedule.enabled) ? "on" : "off"}" onclick="toggleScheduleMode()">
            <span class="toggle-knob"></span>
          </button>
          <span id="scheduleStatusText" style="font-weight:700;">${(c.schedule && c.schedule.enabled) ? "Automatic, from hours below" : "Manual switch"}</span>
        </div>
        <input type="hidden" id="f_schedule_enabled" value="${(c.schedule && c.schedule.enabled) ? "true" : "false"}">
        <div class="hint">When on, your status badge switches itself based on the weekly hours you set below — no need to touch anything day to day. When off, you control it manually with the switch underneath.</div>
      </div>
      <div id="manualStatusWrap" style="display:${(c.schedule && c.schedule.enabled) ? "none" : ""};">
        <div class="field">
          <label>Business status</label>
          <div style="display:flex;align-items:center;gap:12px;margin-top:6px;">
            <button type="button" id="f_isopen_switch" class="toggle-switch ${(c.is_open !== false) ? "on" : "off"}" onclick="toggleOpenStatus()">
              <span class="toggle-knob"></span>
            </button>
            <span id="isOpenStatusText" style="font-weight:700;">${esc(c.status_on_label || statusLabelDefaults(c.business_type).on)}</span>
          </div>
          <input type="hidden" id="f_isopen" value="${(c.is_open !== false) ? "true" : "false"}">
          <div class="hint">Tap to flip the status. The two labels below decide what it actually says — pick whatever fits how your business works.</div>
        </div>
      </div>
      <div id="scheduleRowsWrap" style="display:${(c.schedule && c.schedule.enabled) ? "" : "none"};margin-bottom:16px;">
        <label style="display:block;margin-bottom:8px;">Weekly hours</label>
        ${SCHEDULE_DAYS.map(d => scheduleRowHtml(d, (c.schedule && c.schedule[d.key]))).join("")}
        <div class="hint">Times you cross midnight (e.g. 6pm–2am) are handled correctly — just enter the real open and close times.</div>
      </div>
      <div class="field">
        <label>Label when switched ON</label>
        <input id="f_status_on" value="${esc(c.status_on_label || statusLabelDefaults(c.business_type).on)}" placeholder="e.g. Open, Available, Accepting bookings" oninput="onStatusLabelInput()">
      </div>
      <div class="field">
        <label>Label when switched OFF</label>
        <input id="f_status_off" value="${esc(c.status_off_label || statusLabelDefaults(c.business_type).off)}" placeholder="e.g. Closed, Unavailable, Fully booked" oninput="onStatusLabelInput()">
        <div class="hint">A restaurant might use "Open/Closed." A real estate agent might prefer "Available/Unavailable." A stylist might use "Booking now/Fully booked." Whatever fits.</div>
      </div>
      <div class="field">
        <label>Public search</label>
        <div style="display:flex;align-items:center;gap:12px;margin-top:6px;">
          <button type="button" id="f_listed_switch" class="toggle-switch ${(c.listed_in_directory !== false) ? "on" : "off"}" onclick="toggleListedStatus()">
            <span class="toggle-knob"></span>
          </button>
          <span id="listedStatusText" style="font-weight:700;">${(c.listed_in_directory !== false) ? "Searchable" : "Hidden"}</span>
        </div>
        <input type="hidden" id="f_listed" value="${(c.listed_in_directory !== false) ? "true" : "false"}">
        <div class="hint">When on, people searching RTO's directory by name, business type, or menu items can find you. Your direct link/QR/NFC always works regardless of this setting.</div>
      </div>

      <div class="section-label">Location</div>
      <div class="field"><label>Address / area</label><input id="f_address" value="${esc(c.address||"")}" placeholder="e.g. Ngong Road, next to Total petrol station"></div>
      <div class="field">
        <label>Google Maps link (optional)</label>
        <input id="f_maps_url" value="${esc(c.maps_url||"")}" placeholder="Paste your Google Maps share link">
        <div class="hint">Open Google Maps → search your business → Share → Copy link → paste it here. Adds a "Get Directions" button to your page.</div>
      </div>

      <div class="section-label">Booking settings</div>
      <div class="field">
        <label>Section label shown to customers</label>
        <input id="f_booking_label" value="${esc(c.booking_label || "Book a visit")}" placeholder='e.g. "Book a visit" for appointments, "Order now" for products'>
        <div class="hint">This same feature works for appointments (a salon) or orders (a clothing shop) — just rename it to match what your customers are actually doing.</div>
      </div>
      <div class="field">
        <label>Your booking guidelines / policy (optional)</label>
        <textarea id="f_booking_guidelines" rows="3" placeholder="e.g. A KES 1,000 deposit is required to confirm. Cancellations need 24 hours notice." style="width:100%;background:var(--panel-2);border:1px solid var(--line);border-radius:10px;padding:10px 12px;color:var(--text);font-family:inherit;font-size:14px;margin-top:5px;">${esc(c.booking_guidelines||"")}</textarea>
        <div class="hint">Shown to the customer before they can send a booking request — they must tick a box confirming they've read it. Leave blank if you don't have any special requirements.</div>
      </div>

      <div class="section-label">Save Contact button</div>
      <div class="field"><label>Phone number</label><input id="f_phone" value="${esc(c.phone||"")}" placeholder="+2547XXXXXXXX"><div class="hint">Saved straight into the visitor's phone contacts. Leave blank to hide this button.</div></div>

      <div class="section-label">Connect buttons</div>
      <div class="field"><label>Section label shown to customers</label><input id="f_connect_label" value="${esc(c.connect_label || "Connect")}" placeholder="e.g. Connect, Reach us, Find us"></div>
      <div class="field"><label>WhatsApp number</label><input id="f_wa" value="${esc(c.whatsapp_number||"")}" placeholder="+2547XXXXXXXX"></div>
      <div class="field"><label>WhatsApp opening message</label><input id="f_wamsg" value="${esc(c.whatsapp_message||"Hi, I got your tap card!")}"></div>
      <div class="field"><label>Google review link</label><input id="f_review" value="${esc(c.google_review_url||"")}" placeholder="https://g.page/r/.../review"></div>

      <div class="section-label" style="margin-top:22px;">Social &amp; other links (add as many as you want)</div>
      <p class="hint" style="margin-bottom:10px;">Each one shows as a small quick-tap icon on the page — keeps things clean even with lots of links.</p>
      <div id="socialRowsHolder"></div>
      <button class="btn secondary" type="button" style="width:auto;padding:8px 14px;font-size:13px;" onclick="addSocialRow()">+ Add social link</button>

      <div class="section-label" style="margin-top:22px;">Payment</div>
      <div class="field"><label>Section label shown to customers</label><input id="f_pay_label" value="${esc(c.pay_label || "Pay")}" placeholder="e.g. Pay, Payment, Send Money"></div>
      <div class="field"><label>Till / Paybill number</label><input id="f_till" value="${esc(c.till_number||"")}"></div>
      <div class="field"><label>Label above it</label><input id="f_tillLabel" value="${esc(c.till_label||"M-Pesa Till Number")}"></div>

      <div id="menuSectionWrap">
        <div class="section-label" style="margin-top:22px;">Menu / price list (shown because this business type usually needs one)</div>
        <div class="field"><label>Section label shown to customers</label><input id="f_menu_label" value="${esc(c.menu_label || "Menu")}" placeholder="e.g. Menu, Price List, Services"></div>
        <p class="hint" style="margin-bottom:10px;">Two ways to do this, use either or both: upload a photo of an existing printed menu, and/or type items in manually below.</p>
        <div class="field">
          <label>Upload a menu photo</label>
          <input type="file" id="f_menuimg" accept="image/*">
          ${imgCurrentRow(c.menu_image_url, "menu", "Current menu photo")}
        </div>
        <div id="menuRowsHolder"></div>
        <button class="btn secondary" type="button" style="width:auto;padding:8px 14px;font-size:13px;" onclick="addMenuRow()">+ Add menu item manually</button>
      </div>

      <div class="section-label" style="margin-top:22px;">Gallery / portfolio (optional — name it whatever fits: Gallery, Our Work, Listings, Menu Photos…)</div>
      <div class="field">
        <label>Section title shown to customers</label>
        <input id="f_portfolio_title" value="${esc(c.portfolio_title || "Recent work")}" placeholder="e.g. Recent work, Gallery, Property Listings">
      </div>
      <div id="portfolioRowsHolder"></div>
      <button class="btn secondary" type="button" style="width:auto;padding:8px 14px;font-size:13px;" onclick="addPortfolioRow()">+ Add photo</button>

      <div class="section-label">Appearance</div>
      <div class="field">
        <label>Theme / colour style</label>
        <select id="f_theme" onchange="updateThemeSwatch()">${themeOptions(c.theme)}</select>
        <div class="theme-swatch" id="themeSwatch"></div>
        <div class="hint">A curated set of looks, picked so nothing comes out badly matched. Save, then use "View my public page" to see it live.</div>
      </div>
      <div class="field">
        <label>Profile photo</label>
        <input type="file" id="f_photo" accept="image/*">
        ${imgCurrentRow(c.photo_url, "photo", "Current profile photo")}
      </div>
      <div class="field">
        <label>Background / cover photo</label>
        <input type="file" id="f_bg" accept="image/*">
        ${imgCurrentRow(c.background_url, "background", "Current background photo")}
      </div>
      <div class="field">
        <label>Cover height (only matters if you have a cover photo)</label>
        <select id="f_cover_style">
          <option value="compact" ${(c.cover_style||"compact")==="compact" ? "selected" : ""}>Compact — small band at top</option>
          <option value="half" ${c.cover_style==="half" ? "selected" : ""}>Half screen</option>
          <option value="full" ${c.cover_style==="full" ? "selected" : ""}>Full screen — name overlaid on the photo</option>
        </select>
        <div class="hint">Half and Full only take effect if a cover photo is uploaded — otherwise this is ignored automatically.</div>
      </div>
      <div class="field">
        <label>Cover darkness — <span id="coverOverlayLabel">${c.cover_overlay != null ? c.cover_overlay : 40}%</span></label>
        <input type="range" id="f_cover_overlay" min="0" max="80" value="${c.cover_overlay != null ? c.cover_overlay : 40}" oninput="document.getElementById('coverOverlayLabel').textContent=this.value+'%'" style="padding:0;">
        <div class="hint">Darkens the cover photo so your name stays readable over busy or bright images.</div>
      </div>`;
}
function afterFormRendered(){
  renderMenuRows();
  renderPortfolioRows();
  renderSocialRows();
  onBizTypeChange();
  updateThemeSwatch();
}

function showForm(existing){
  editingSlug = existing ? existing.slug : null;
  existingRef = existing || null;
  removeFlags = { photo:false, background:false, menu:false };
  currentMode = "admin";
  if (!existing) menuRows = [];
  initPortfolioRows(existing);
  initSocialRows(existing);
  const c = existing || {};
  const heading = existing ? `Editing ${esc(c.name)}` : "New customer profile";

  document.getElementById("formHolder").innerHTML = `
    <div class="card" style="margin:16px 0;">
      <p style="font-weight:700;margin:0 0 4px;">${heading}</p>
      <p class="hint" style="margin-bottom:16px;">Works for any kind of business — restaurant, salon, agent, boutique, freelancer. Only what you fill in below is ever shown publicly when someone taps or scans — leave anything blank to keep it private. Only name and Link ID are required.</p>
      ${customerFormFieldsHtml(c, existing)}
      <div class="btn-row">
        <button class="btn" id="saveBtn" onclick="saveCustomer()">${existing ? "Save changes" : "Save & publish"}</button>
        <button class="btn secondary" onclick="editingSlug=null; document.getElementById('formHolder').innerHTML=''">Cancel</button>
      </div>
    </div>`;
  afterFormRendered();
}

function imgCurrentRow(url, key, label){
  if (!url) return "";
  return `
    <div id="imgrow_${key}">
      <div class="img-preview-row">
        <img src="${esc(url)}">
        <div class="txt">${label}</div>
        <button type="button" onclick="markRemove('${key}')">Remove</button>
      </div>
    </div>`;
}
function markRemove(key){
  removeFlags[key] = true;
  const row = document.getElementById(`imgrow_${key}`);
  if (row) row.innerHTML = `<div class="removed-note">Will be removed when you save. <button type="button" onclick="unmarkRemove('${key}')">Undo</button></div>`;
}
function unmarkRemove(key){
  removeFlags[key] = false;
  if (currentMode === "owner") renderOwnerEditor(existingRef);
  else showForm(existingRef);
}

/* ---- menu rows ---- */
function renderMenuRows(){
  const holder = document.getElementById("menuRowsHolder");
  if (!holder) return;
  if (!menuRows.length) {
    holder.innerHTML = `<p class="hint" style="margin-bottom:10px;">No manual items yet.</p>`;
    return;
  }
  holder.innerHTML = menuRows.map((row, i) => `
    <div style="display:flex;gap:8px;margin-bottom:8px;align-items:flex-start;flex-wrap:wrap;">
      <input style="flex:2;min-width:120px;" placeholder="Item name" value="${esc(row.name)}" oninput="menuRows[${i}].name=this.value">
      <input style="flex:1;min-width:80px;" placeholder="Price" value="${esc(row.price)}" oninput="menuRows[${i}].price=this.value">
      <input style="flex:1;min-width:80px;" placeholder="Category" value="${esc(row.category||"")}" oninput="menuRows[${i}].category=this.value">
      <button class="icon-btn" style="margin-top:5px;" onclick="removeMenuRow(${i})">&#10005;</button>
    </div>`).join("");
}
function addMenuRow(){ menuRows.push({ name:"", price:"", category:"" }); renderMenuRows(); }
function removeMenuRow(i){ menuRows.splice(i,1); renderMenuRows(); }

/* ---- portfolio rows ---- */
function renderPortfolioRows(){
  const holder = document.getElementById("portfolioRowsHolder");
  if (!holder) return;
  if (!portfolioRows.length) {
    holder.innerHTML = `<p class="hint" style="margin-bottom:10px;">No photos yet — click "Add photo" below. Skip this whole section if it doesn't apply.</p>`;
    return;
  }
  holder.innerHTML = portfolioRows.map((row, i) => {
    const thumbSrc = row.newFile ? URL.createObjectURL(row.newFile) : row.existingUrl;
    return `
    <div class="pf-row">
      <div class="pf-thumb">${thumbSrc ? `<img src="${thumbSrc}">` : "No photo"}</div>
      <div class="pf-fields">
        <input type="file" accept="image/*" onchange="handlePortfolioFile(${i}, this)">
        ${row.fileName ? `<div class="hint" style="margin:2px 0;">Selected: ${esc(row.fileName)}</div>` : ""}
        <input type="text" placeholder="Caption (optional)" value="${esc(row.caption)}" oninput="portfolioRows[${i}].caption=this.value">
      </div>
      <button class="pf-remove" type="button" onclick="removePortfolioRow(${i})">Remove</button>
    </div>`;
  }).join("");
}
function handlePortfolioFile(i, input){
  const file = input.files[0];
  if (!file) return;
  portfolioRows[i].newFile = file;
  portfolioRows[i].fileName = file.name;
  renderPortfolioRows();
}
function addPortfolioRow(){ portfolioRows.push({ existingUrl:null, caption:"", newFile:null, fileName:"" }); renderPortfolioRows(); }
function removePortfolioRow(i){
  const row = portfolioRows[i];
  if (row.existingUrl) deletedPortfolioUrls.push(row.existingUrl);
  portfolioRows.splice(i,1);
  renderPortfolioRows();
}

/* ---- social rows ---- */
function renderSocialRows(){
  const holder = document.getElementById("socialRowsHolder");
  if (!holder) return;
  if (!socialRows.length) {
    holder.innerHTML = `<p class="hint" style="margin-bottom:10px;">No social links yet — click "Add social link" below.</p>`;
    return;
  }
  holder.innerHTML = socialRows.map((row, i) => `
    <div class="soc-row">
      <select onchange="socialRows[${i}].platform=this.value; renderSocialRows();">
        ${SOCIAL_PLATFORMS.map(p => `<option value="${p.id}" ${p.id===row.platform ? "selected" : ""}>${esc(p.label)}</option>`).join("")}
      </select>
      <input placeholder="${esc(socialMeta(row.platform).placeholder)}" value="${esc(row.value)}" oninput="socialRows[${i}].value=this.value">
      <button class="pf-remove" type="button" onclick="removeSocialRow(${i})">Remove</button>
    </div>`).join("");
}
function addSocialRow(){ socialRows.push({ platform:"instagram", value:"" }); renderSocialRows(); }
function removeSocialRow(i){ socialRows.splice(i,1); renderSocialRows(); }

let slugTouched = false;
function autoSlug(){
  if (slugTouched || editingSlug) return;
  document.getElementById("f_slug").value = slugify(document.getElementById("f_name").value);
}
document.addEventListener("input", e => { if (e.target && e.target.id === "f_slug") slugTouched = true; });

async function uploadImage(fileInputId, slugValue, tag){
  if (blockPreviewWrite("Image uploads are disabled in the verification preview.")) return null;

  const input = document.getElementById(fileInputId);
  const file = input && input.files[0];
  if (!file) return null;
  const path = `${slugValue}/${tag}-${Date.now()}-${file.name}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, file, { upsert:true });
  if (error) { toast("Photo upload failed: " + error.message); return null; }
  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

async function saveCustomer(){
  if (blockPreviewWrite("Customer edits are disabled in the verification preview.")) return;

  const name = document.getElementById("f_name").value.trim();
  const slugValue = slugify(document.getElementById("f_slug").value);
  const bizTypeCheck = document.getElementById("f_biztype").value;
  if (!name || !slugValue) { toast("Name and Link ID are required"); return; }
  if (!bizTypeCheck) { toast("Please select a business type"); return; }

  const btn = document.getElementById("saveBtn");
  btn.textContent = "Saving…"; btn.disabled = true;

  const photoUrl = await uploadImage("f_photo", slugValue, "photo");
  const bgUrl = await uploadImage("f_bg", slugValue, "bg");
  const menuImgUrl = await uploadImage("f_menuimg", slugValue, "menu");

  const finalPortfolio = [];
  for (let i = 0; i < portfolioRows.length; i++) {
    const row = portfolioRows[i];
    let imageUrl = row.existingUrl;
    if (row.newFile) {
      const path = `${slugValue}/portfolio-${i}-${Date.now()}-${row.newFile.name}`;
      const { error: upErr } = await sb.storage.from(BUCKET).upload(path, row.newFile, { upsert:true });
      if (upErr) { toast("A portfolio photo failed to upload: " + upErr.message); }
      else {
        const { data: pubData } = sb.storage.from(BUCKET).getPublicUrl(path);
        if (row.existingUrl) deletedPortfolioUrls.push(row.existingUrl);
        imageUrl = pubData.publicUrl;
      }
    }
    if (imageUrl || (row.caption && row.caption.trim())) {
      finalPortfolio.push({ image_url: imageUrl || null, caption: (row.caption || "").trim() });
    }
  }

  const bizType = document.getElementById("f_biztype").value;
  const menuApplies = MENU_BIZ_TYPES.includes(bizType);

  const cleanMenu = menuApplies ? menuRows
    .filter(r => r.name && r.name.trim())
    .map(r => ({ name: r.name.trim(), price: (r.price||"").trim(), category: (r.category||"").trim() }))
    : [];

  const cleanSocial = socialRows
    .filter(r => r.value && r.value.trim())
    .map(r => ({ platform: r.platform, value: r.value.trim() }));

  const themeValue = document.getElementById("f_theme").value;

  const record = {
    slug: slugValue,
    name,
    business_type: bizType,
    title: document.getElementById("f_title").value.trim(),
    is_open: document.getElementById("f_isopen").value === "true",
    schedule: collectScheduleFromForm(),
    status_on_label: document.getElementById("f_status_on").value.trim() || "Open",
    status_off_label: document.getElementById("f_status_off").value.trim() || "Closed",
    address: document.getElementById("f_address").value.trim(),
    maps_url: document.getElementById("f_maps_url").value.trim(),
    booking_guidelines: document.getElementById("f_booking_guidelines").value.trim(),
    booking_label: document.getElementById("f_booking_label").value.trim() || "Book a visit",
    listed_in_directory: document.getElementById("f_listed").value === "true",
    phone: document.getElementById("f_phone").value.trim(),
    whatsapp_number: document.getElementById("f_wa").value.trim(),
    whatsapp_message: document.getElementById("f_wamsg").value.trim(),
    google_review_url: document.getElementById("f_review").value.trim(),
    connect_label: document.getElementById("f_connect_label").value.trim() || "Connect",
    till_number: document.getElementById("f_till").value.trim(),
    till_label: document.getElementById("f_tillLabel").value.trim(),
    pay_label: document.getElementById("f_pay_label").value.trim() || "Pay",
    menu_label: document.getElementById("f_menu_label") ? (document.getElementById("f_menu_label").value.trim() || "Menu") : "Menu",
    portfolio: finalPortfolio,
    portfolio_title: document.getElementById("f_portfolio_title").value.trim() || "Recent work",
    menu_items: cleanMenu,
    social_links: cleanSocial,
    theme: themeValue,
    cover_style: document.getElementById("f_cover_style").value,
    cover_overlay: parseInt(document.getElementById("f_cover_overlay").value, 10) || 0,
  };

  if (photoUrl) record.photo_url = photoUrl;
  else if (removeFlags.photo) record.photo_url = null;
  if (bgUrl) record.background_url = bgUrl;
  else if (removeFlags.background) record.background_url = null;
  if (menuImgUrl) record.menu_image_url = menuImgUrl;
  else if (removeFlags.menu) record.menu_image_url = null;

  const wasEditing = !!editingSlug;
  const { error } = await sb.from("customers").upsert(record, { onConflict: "slug" });
  btn.textContent = wasEditing ? "Save changes" : "Save & publish"; btn.disabled = false;

  if (error) { toast("Couldn't save: " + error.message); return; }

  if (removeFlags.photo && existingRef && existingRef.photo_url) deleteFromStorage(existingRef.photo_url);
  if (removeFlags.background && existingRef && existingRef.background_url) deleteFromStorage(existingRef.background_url);
  if (removeFlags.menu && existingRef && existingRef.menu_image_url) deleteFromStorage(existingRef.menu_image_url);
  for (const oldUrl of deletedPortfolioUrls) deleteFromStorage(oldUrl);

  toast(wasEditing ? `${name}'s page updated` : `Saved — ${name}'s page is live`);

  if (currentMode === "owner") {
    existingRef = { ...existingRef, ...record };
    menuRows = []; portfolioRows = []; deletedPortfolioUrls = []; socialRows = [];
    renderOwnerEditor(existingRef);
    return;
  }

  document.getElementById("formHolder").innerHTML = "";
  slugTouched = false;
  editingSlug = null;
  existingRef = null;
  menuRows = []; portfolioRows = []; deletedPortfolioUrls = []; socialRows = [];
  loadCustomerList();
  if (!wasEditing) showQr(slugValue, name);
}

const BIZ_TYPES = [
  { value:"",              label:"Select a type…" },
  { value:"restaurant",    label:"Restaurant / Café / Bar" },
  { value:"salon",         label:"Salon / Barbershop / Spa" },
  { value:"retail",        label:"Retail / Boutique / Shop" },
  { value:"hospitality",   label:"Hotel / Event / Hospitality" },
  { value:"real_estate",   label:"Real Estate / Property" },
  { value:"professional",  label:"Professional Services / Freelancer" },
  { value:"parking",       label:"Parking / Vehicle Services" },
  { value:"other",         label:"Other / General" },
];
const MENU_BIZ_TYPES = ["restaurant","salon","retail","hospitality"];
function bizTypeOptions(selected){
  return BIZ_TYPES.map(t => `<option value="${t.value}" ${t.value===(selected||"") ? "selected" : ""}>${esc(t.label)}</option>`).join("");
}
const STATUS_LABEL_DEFAULTS = {
  restaurant:   { on: "Open",      off: "Closed" },
  salon:        { on: "Open",      off: "Closed" },
  retail:       { on: "Open",      off: "Closed" },
  hospitality:  { on: "Open",      off: "Closed" },
  real_estate:  { on: "Available", off: "Unavailable" },
  professional: { on: "Available", off: "Unavailable" },
  parking:      { on: "Spaces Available", off: "Full" },
  other:        { on: "Available", off: "Unavailable" },
};
function statusLabelDefaults(bizType){
  return STATUS_LABEL_DEFAULTS[bizType] || { on: "Open", off: "Closed" };
}
const SCHEDULE_DAYS = [
  { key:"mon", label:"Monday" }, { key:"tue", label:"Tuesday" }, { key:"wed", label:"Wednesday" },
  { key:"thu", label:"Thursday" }, { key:"fri", label:"Friday" }, { key:"sat", label:"Saturday" }, { key:"sun", label:"Sunday" },
];
function scheduleRowHtml(day, data){
  const d = data || { open:"09:00", close:"18:00", closed:false };
  return `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
      <span style="width:78px;font-size:12.5px;color:var(--text-dim);flex-shrink:0;">${day.label}</span>
      <input type="time" id="sched_${day.key}_open" value="${d.open||'09:00'}" style="flex:1;min-width:95px;margin:0;" ${d.closed ? "disabled" : ""}>
      <span style="font-size:12px;color:var(--text-dim);">to</span>
      <input type="time" id="sched_${day.key}_close" value="${d.close||'18:00'}" style="flex:1;min-width:95px;margin:0;" ${d.closed ? "disabled" : ""}>
      <label style="display:flex;align-items:center;gap:4px;font-size:11.5px;color:var(--text-dim);white-space:nowrap;">
        <input type="checkbox" id="sched_${day.key}_closed" ${d.closed ? "checked" : ""} onchange="onScheduleDayClosedToggle('${day.key}')"> Closed
      </label>
    </div>`;
}
function onScheduleDayClosedToggle(dayKey){
  const closed = document.getElementById(`sched_${dayKey}_closed`).checked;
  document.getElementById(`sched_${dayKey}_open`).disabled = closed;
  document.getElementById(`sched_${dayKey}_close`).disabled = closed;
}
function toggleScheduleMode(){
  const hidden = document.getElementById("f_schedule_enabled");
  const btn = document.getElementById("f_schedule_switch");
  const text = document.getElementById("scheduleStatusText");
  const newState = hidden.value !== "true";
  hidden.value = newState ? "true" : "false";
  btn.classList.toggle("on", newState);
  btn.classList.toggle("off", !newState);
  text.textContent = newState ? "Automatic, from hours below" : "Manual switch";
  document.getElementById("manualStatusWrap").style.display = newState ? "none" : "";
  document.getElementById("scheduleRowsWrap").style.display = newState ? "" : "none";
}
function collectScheduleFromForm(){
  const schedule = { enabled: document.getElementById("f_schedule_enabled").value === "true" };
  SCHEDULE_DAYS.forEach(day => {
    schedule[day.key] = {
      open: document.getElementById(`sched_${day.key}_open`).value || "09:00",
      close: document.getElementById(`sched_${day.key}_close`).value || "18:00",
      closed: document.getElementById(`sched_${day.key}_closed`).checked,
    };
  });
  return schedule;
}

/* Returns true/false if a schedule is active and tells us the current
   status, or null if no schedule is set (caller should fall back to the
   manual switch). Handles hours that cross midnight correctly. nowOverride
   is only used by tests, to check specific days/times deterministically. */
function computeScheduledStatus(schedule, nowOverride){
  if (!schedule || !schedule.enabled) return null;
  const dayIndexToKey = ["sun","mon","tue","wed","thu","fri","sat"];
  const now = nowOverride || new Date();
  const todayKey = dayIndexToKey[now.getDay()];
  const yesterdayKey = dayIndexToKey[(now.getDay() + 6) % 7];
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const toMinutes = (t) => { const [h,m] = (t||"00:00").split(":").map(Number); return h*60+m; };
  const today = schedule[todayKey];
  const yesterday = schedule[yesterdayKey];

  if (today && !today.closed) {
    const openM = toMinutes(today.open);
    const closeM = toMinutes(today.close);
    if (closeM > openM) {
      if (nowMinutes >= openM && nowMinutes < closeM) return true;
    } else {
      // crosses midnight (e.g. 18:00 -> 02:00): open from openM through end of day
      if (nowMinutes >= openM) return true;
    }
  }
  if (yesterday && !yesterday.closed) {
    const yOpenM = toMinutes(yesterday.open);
    const yCloseM = toMinutes(yesterday.close);
    if (yCloseM <= yOpenM) {
      // yesterday's hours crossed into today — still open if before that close time
      if (nowMinutes < yCloseM) return true;
    }
  }
  return false;
}

function onStatusLabelInput(){
  const text = document.getElementById("isOpenStatusText");
  const hidden = document.getElementById("f_isopen");
  if (!text || !hidden) return;
  const onLabel = document.getElementById("f_status_on").value.trim() || "Open";
  const offLabel = document.getElementById("f_status_off").value.trim() || "Closed";
  text.textContent = hidden.value === "true" ? onLabel : offLabel;
}
function toggleOpenStatus(){
  const hidden = document.getElementById("f_isopen");
  const btn = document.getElementById("f_isopen_switch");
  const text = document.getElementById("isOpenStatusText");
  const newState = hidden.value !== "true";
  hidden.value = newState ? "true" : "false";
  btn.classList.toggle("on", newState);
  btn.classList.toggle("off", !newState);
  const onLabel = (document.getElementById("f_status_on") || {}).value || "Open";
  const offLabel = (document.getElementById("f_status_off") || {}).value || "Closed";
  text.textContent = newState ? onLabel : offLabel;
}
function toggleListedStatus(){
  const hidden = document.getElementById("f_listed");
  const btn = document.getElementById("f_listed_switch");
  const text = document.getElementById("listedStatusText");
  const newState = hidden.value !== "true";
  hidden.value = newState ? "true" : "false";
  btn.classList.toggle("on", newState);
  btn.classList.toggle("off", !newState);
  text.textContent = newState ? "Searchable" : "Hidden";
}
function onBizTypeChange(){
  const val = document.getElementById("f_biztype").value;
  const wrap = document.getElementById("menuSectionWrap");
  if (wrap) wrap.style.display = MENU_BIZ_TYPES.includes(val) ? "" : "none";

  // Suggest fresh status labels for the new type, but only into fields the
  // user hasn't already typed something custom into (blank-check only).
  const onField = document.getElementById("f_status_on");
  const offField = document.getElementById("f_status_off");
  if (onField && offField) {
    const defaults = statusLabelDefaults(val);
    const wasDefaultPair = Object.values(STATUS_LABEL_DEFAULTS).some(d => d.on === onField.value.trim() && d.off === offField.value.trim());
    if (wasDefaultPair || (!onField.value.trim() && !offField.value.trim())) {
      onField.value = defaults.on;
      offField.value = defaults.off;
      onStatusLabelInput();
    }
  }
}

/* ---- QR modal ---- */
const QR_SECTIONS = [
  { value: "", label: "Full page (default)" },
  { value: "section-menu", label: "Jump straight to Menu" },
  { value: "section-connect", label: "Jump straight to Connect (WhatsApp/Reviews)" },
  { value: "section-pay", label: "Jump straight to Pay" },
  { value: "section-gallery", label: "Jump straight to Gallery" },
];
function showQr(slugValue, name){
  document.body.insertAdjacentHTML("beforeend", `
    <div class="modal-bg" id="qrModal" onclick="if(event.target.id==='qrModal') closeQr()">
      <div class="modal">
        <p style="font-weight:700;margin:0;">${esc(name)}'s QR code</p>
        <p class="hint" style="margin-bottom:10px;">Print this or scan it directly to test.</p>
        <label style="text-align:left;display:block;font-size:12px;">Where should this QR open to?</label>
        <select id="qrSectionPicker" onchange="regenerateQrModal('${slugValue}','${esc(name).replace(/'/g,"\\'")}')">
          ${QR_SECTIONS.map(s => `<option value="${s.value}">${s.label}</option>`).join("")}
        </select>
        <div class="hint" style="margin-bottom:6px;">e.g. a QR on tables that opens straight to the Menu, or one on receipts that jumps to Reviews.</div>
        <div id="qrcanvas-holder"></div>
        <button class="btn" id="dlBtn">Download QR</button>
        <p class="hint" id="qrLinkText" style="margin-top:12px;word-break:break-all;color:var(--cyan);"></p>
        <button class="btn secondary" style="margin-top:12px;" onclick="closeQr()">Close</button>
      </div>
    </div>`);
  drawQrCanvas(slugValue, name);
}
function regenerateQrModal(slugValue, name){
  drawQrCanvas(slugValue, name);
}
function drawQrCanvas(slugValue, name){
  const section = document.getElementById("qrSectionPicker").value;
  const link = tapLink(slugValue) + (section ? "#" + section : "");
  const holder = document.getElementById("qrcanvas-holder");
  holder.innerHTML = "";
  document.getElementById("qrLinkText").textContent = link;
  new QRCode(holder, { text: link, width: 240, height: 240, colorDark:"#0A0A10", colorLight:"#ffffff" });
  setTimeout(() => {
    const canvas = holder.querySelector("canvas");
    document.getElementById("dlBtn").onclick = () => {
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      const section2 = document.getElementById("qrSectionPicker").value;
      a.download = `${slugValue}${section2 ? "-" + section2 : ""}-qr.png`;
      a.click();
    };
  }, 150);
}
function closeQr(){ const m = document.getElementById("qrModal"); if (m) m.remove(); }

/* ---- Owner access modal ---- */
async function showOwnerAccessModal(slug){
  if (blockPreviewWrite("Owner-code changes are disabled in the verification preview.")) return;
  const c = __rtoCustomers.find(x => x.slug === slug);
  if (!c) { toast("Couldn't find that customer"); return; }
  try {
    const result = await rtoApi("admin-owner-code", { slug });
    renderOwnerAccessModal({ ...c, owner_code: result.code });
  } catch (error) { toast(error.message || "Couldn't issue a new owner access code."); }
}
function renderOwnerAccessModal(c){
  const old = document.getElementById("ownerModal");
  if (old) old.remove();
  const link = ownerLink(c.slug);
  document.body.insertAdjacentHTML("beforeend", `
    <div class="modal-bg" id="ownerModal" onclick="if(event.target.id==='ownerModal') closeOwnerModal()">
      <div class="modal">
        <p style="font-weight:700;margin:0;">${esc(c.name)}'s private access</p>
        <p class="hint" style="margin-bottom:16px;">Send them both of these. With this link and code, they can view and edit only their own page — they can never see or reach any other business on the system.</p>

        <label style="text-align:left;display:block;">Their login link</label>
        <input readonly value="${esc(ownerLink(c.slug))}" onclick="this.select()">
        <button class="btn secondary" style="margin-top:8px;" onclick="navigator.clipboard.writeText('${link}');toast('Link copied')">Copy link</button>

        <label style="text-align:left;display:block;margin-top:16px;">Their access code</label>
        <input readonly value="${esc(c.owner_code)}" style="font-family:monospace;font-weight:700;letter-spacing:2px;text-align:center;font-size:18px;" onclick="this.select()">
        <button class="btn secondary" style="margin-top:8px;" onclick="navigator.clipboard.writeText('${c.owner_code}');toast('Code copied')">Copy code</button>

        <button class="btn danger" style="margin-top:18px;" onclick="regenerateOwnerCode('${c.slug}')">Regenerate code (revokes the old one)</button>
        <button class="btn secondary" style="margin-top:10px;" onclick="closeOwnerModal()">Close</button>
      </div>
    </div>`);
}
async function regenerateOwnerCode(slug){
  if (blockPreviewWrite("Owner-code changes are disabled in the verification preview.")) return;
  if (!confirm("This makes their old code stop working immediately. Continue?")) return;
  try {
    const result = await rtoApi("admin-owner-code", { slug });
    const c = __rtoCustomers.find(x => x.slug === slug);
    if (!c) { toast("Couldn't find that customer"); return; }
    toast("New code generated");
    renderOwnerAccessModal({ ...c, owner_code: result.code });
  } catch (error) { toast(error.message || "Couldn't regenerate the code."); }
}
function closeOwnerModal(){ const m = document.getElementById("ownerModal"); if (m) m.remove(); }

/* ============================================================
   OWNER PORTAL — a business's own private, restricted access
   ============================================================ */
async function renderOwnerGate(slugValue){
  if (IS_NETLIFY_PREVIEW) { renderPreviewAccessNotice("Owner editing is disabled in this verification preview."); return; }

  app.innerHTML = `<div class="center-screen"><p class="muted">Loading…</p></div>`;
  let data = null;
  try { const result = await rtoApi("owner-info", { slug: slugValue }); data = result.customer || null; } catch {}
  if (!data) {
    app.innerHTML = `<div class="center-screen"><div style="text-align:center;"><p style="font-weight:700;">Link not found</p><p class="muted">This business login link isn't set up. Ask RTO to resend it.</p></div></div>`;
    return;
  }
  app.innerHTML = `
    <div class="center-screen">
      <div class="wrap" style="max-width:360px;">
        <div class="brand"><div class="mark">RTO</div><span>ReviewTapOperate</span></div>
        <div class="card">
          <p style="font-weight:700;margin:0 0 4px;">${esc(data.name)}</p>
          <p class="hint" style="margin-bottom:14px;">Enter your access code to view and edit your own page.</p>
          <input type="text" id="ownerCode" placeholder="Access code" style="text-align:center;letter-spacing:2px;font-family:monospace;text-transform:uppercase;">
          <button class="btn" style="margin-top:14px;" onclick="checkOwnerCode('${slugValue}')">Unlock my page</button>
        </div>
        <p class="hint" style="text-align:center;margin-top:14px;">
          This code only unlocks this one business's page. You cannot see or reach any other business on this system.
        </p>
      </div>
    </div>`;
  document.getElementById("ownerCode").addEventListener("keydown", e => { if(e.key==="Enter") checkOwnerCode(slugValue); });
  window.__ownerGateRecord = data;
}
async function checkOwnerCode(slugValue){
  if (blockPreviewWrite("Owner access is disabled in the verification preview.")) return;
  const entered = document.getElementById("ownerCode").value.trim().toUpperCase();
  if (!entered) { toast("Enter your access code"); return; }
  try {
    const result = await rtoApi("owner-login", { slug: slugValue, code: entered });
    if (!result.customer) throw new Error("This business access could not be verified.");
    currentMode = "owner";
    renderOwnerEditor(result.customer);
  } catch (error) { toast(error.message || "Incorrect access code or link."); }
}

function renderOwnerEditor(c){
  currentMode = "owner";
  editingSlug = c.slug;
  existingRef = c;
  removeFlags = { photo:false, background:false, menu:false };
  menuRows = (c.menu_items && c.menu_items.length) ? [...c.menu_items] : [];
  initPortfolioRows(c);
  initSocialRows(c);

  app.innerHTML = `
    <div class="wrap">
      <div class="top-bar">
        <div class="brand" style="margin:20px 0 0;"><div class="mark">RTO</div><span>ReviewTapOperate</span></div>
        <button class="icon-btn" title="Log out" onclick="renderLanding('home')">&#8630;</button>
      </div>
      <div class="card" style="margin:16px 0;">
        <p style="font-weight:700;margin:0 0 4px;">Your page</p>
        <p class="hint" style="margin-bottom:16px;">
          Only what you fill in below is ever shown to someone who taps or scans your card. Leave anything blank and it simply won't appear — nothing about you is shared beyond what you choose here.
        </p>
        ${customerFormFieldsHtml(c, true)}
        <div class="btn-row">
          <button class="btn" id="saveBtn" onclick="saveCustomer()">Save changes</button>
          <a class="btn outline-cyan" href="${tapLink(c.slug)}" target="_blank" rel="noreferrer">View my public page</a>
          <button class="btn secondary" type="button" onclick="renderAnalyticsModal('${c.slug}','${esc(c.name).replace(/'/g,"\\'")}')">View my analytics</button>
          <button class="btn secondary" type="button" onclick="showBookingsInbox('${c.slug}','${esc(c.name).replace(/'/g,"\\'")}')">View bookings</button>
        </div>
      </div>
      <p class="hint" style="text-align:center;">Need your page fully removed, or lost your code? Contact ReviewTapOperate directly — this isn't something you can undo from here.</p>
    </div>`;
  afterFormRendered();
}

/* ============================================================
   PUBLIC TAP PAGE — no login, guest access only, any business type.
   Analytics are logged here but never displayed here.
   ============================================================ */
async function renderPublicProfile(s){
  app.innerHTML = `<div class="center-screen"><p class="muted">Loading…</p></div>`;
  const { data, error } = await sb.from("customers").select("*").eq("slug", s).maybeSingle();
  if (error || !data) {
    app.innerHTML = `<div class="center-screen"><div style="text-align:center;"><p style="font-weight:700;">Profile not found</p><p class="muted">This tap link isn't set up yet.</p></div></div>`;
    return;
  }
  logEvent(s, "view", null);
  renderPublicProfileData(data);
  subscribeToLiveUpdates(s);
  scrollToAnchorIfPresent();
}
function scrollToAnchorIfPresent(){
  if (!window.location.hash) return;
  setTimeout(() => {
    const el = document.getElementById(window.location.hash.slice(1));
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 150);
}

/* Live updates: if the business edits and saves while a visitor has this
   page open, it refreshes on its own within a second or two — no reload
   needed. Requires realtime enabled on the customers table (see setup SQL). */
function subscribeToLiveUpdates(slugValue){
  if (window.__rtoChannel) {
    try { sb.removeChannel(window.__rtoChannel); } catch(e) { /* ignore */ }
  }
  window.__rtoChannel = sb
    .channel("public-profile-" + slugValue)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "customers", filter: `slug=eq.${slugValue}` }, (payload) => {
      if (payload && payload.new) renderPublicProfileData(payload.new);
    })
    .subscribe();
}

function renderPublicProfileData(c){
  const s = c.slug;
  applyTheme(c.theme || "neon");
  setPageSeoTags(c);

  const socialList = (c.social_links && c.social_links.length) ? c.social_links : legacySocialSeed(c);
  const scheduledStatus = computeScheduledStatus(c.schedule);
  const isOpen = scheduledStatus !== null ? scheduledStatus : (c.is_open !== false); // schedule wins if active, else the manual switch
  const onLabel = c.status_on_label || statusLabelDefaults(c.business_type).on;
  const offLabel = c.status_off_label || statusLabelDefaults(c.business_type).off;
  const statusBadge = `<span class="status-badge ${isOpen ? "open" : "closed"}"><span class="dot"></span>${esc(isOpen ? onLabel : offLabel)}</span>`;

  // Full/Half hero mode only makes sense with an actual cover photo — otherwise fall back to compact automatically
  const effectiveCoverStyle = c.background_url ? (c.cover_style || "compact") : "compact";
  const overlayAlpha = Math.max(0, Math.min(80, c.cover_overlay != null ? c.cover_overlay : 40)) / 100;

  const signboxInner = `
    <div class="avatar-lg" ${c.photo_url ? `style="cursor:zoom-in;" onclick="openLightbox('${esc(c.photo_url)}')"` : ""}>${c.photo_url ? `<img src="${esc(c.photo_url)}">` : initials(c.name)}</div>
    <h1 class="p-name">${esc(c.name)}</h1>
    ${c.title ? `<p class="p-title">${esc(c.title)}</p>` : ""}
    ${c.address ? `<p class="p-title" style="margin-top:2px;">&#128205; ${esc(c.address)}</p>` : ""}
    ${statusBadge}
    ${c.phone ? `<a class="btn-save-public" download="${esc(c.name)}.vcf" href="${vcard(c)}" onclick="logEvent('${s}','click','Save Contact')">Save this contact</a>` : ""}
    <button type="button" class="btn secondary" style="margin:10px auto 0;max-width:280px;width:auto;padding:9px 20px;" data-slug="${esc(s)}" data-name="${esc(c.name)}" onclick="sharePage(this)">Share this page</button>`;

  const belowSections = `
      ${(c.whatsapp_number || c.google_review_url || c.maps_url || socialList.length) ? `
        <p class="p-section-h" id="section-connect">${esc(c.connect_label || "Connect")}</p>
        ${c.whatsapp_number ? tube(`https://wa.me/${digits(c.whatsapp_number)}?text=${encodeURIComponent(c.whatsapp_message||"Hi!")}`,"cyan","Chat on WhatsApp","Send a message directly", s) : ""}
        ${c.google_review_url ? tube(c.google_review_url,"pink","Leave a Google review","Takes 30 seconds", s) : ""}
        ${c.maps_url ? tube(c.maps_url,"cyan","Get directions","Open in Google Maps", s) : ""}
        ${socialList.map((soc,i) => socialTube(soc, i%2===0 ? "cyan" : "pink", s)).join("")}
      ` : ""}

      ${c.till_number ? `
        <p class="p-section-h" id="section-pay">${esc(c.pay_label || "Pay")}</p>
        <div class="pay-row">
          <div><div class="hint" style="margin:0;">${esc(c.till_label||"Till Number")}</div><div class="value">${esc(c.till_number)}</div></div>
          <button class="btn secondary" style="width:auto;padding:9px 14px;" onclick="navigator.clipboard.writeText('${esc(c.till_number)}');toast('Copied');logEvent('${s}','click','Copy Till Number')">Copy</button>
        </div>` : ""}

      ${(c.menu_image_url || (c.menu_items && c.menu_items.length)) ? `
        <p class="p-section-h" id="section-menu">${esc(c.menu_label || "Menu")}</p>
        ${c.menu_image_url ? `<div class="menu-image-wrap" onclick="openLightbox('${esc(c.menu_image_url)}')"><img src="${esc(c.menu_image_url)}"></div>` : ""}
        ${(c.menu_items && c.menu_items.length) ? groupMenuByCategory(c.menu_items) : ""}
      ` : ""}

      ${(c.portfolio && c.portfolio.length) ? `
        <p class="p-section-h" id="section-gallery">${esc(c.portfolio_title || "Recent work")}</p>
        <div class="strip">${c.portfolio.map(p => portfolioCard(p)).join("")}</div>
      ` : ""}

      <p class="p-section-h" id="section-book">${esc(c.booking_label || "Book a visit")}</p>
      <div class="info-card">
        <div class="info-title">${esc(c.booking_label || "Ready to visit?")}</div>
        <p class="hint" style="margin-bottom:12px;">Send your preferred date and time — they'll confirm with you directly.</p>
        <div id="bookingWrap">
          <button class="btn outline-cyan" data-slug="${esc(s)}" data-name="${esc(c.name)}" data-guidelines="${esc(c.booking_guidelines||"")}" onclick="startBookingFlow(this)">Request a booking</button>
        </div>
      </div>

      <p class="p-section-h" id="section-reviews">Reviews</p>
      <div class="info-card" id="reviewsSection"><p class="hint">Loading reviews…</p></div>

      <p class="footer-tag">Powered by ReviewTapOperate</p>
      <a href="https://wa.me/${CONTACT_WHATSAPP}?text=${encodeURIComponent("Hi, I saw a ReviewTapOperate page and I'm interested in getting one for my own business")}" target="_blank" rel="noreferrer" class="footer-tag" style="text-decoration:underline;display:block;margin-top:4px;">Want a page like this for your business? Contact us</a>`;

  if (effectiveCoverStyle === "half" || effectiveCoverStyle === "full") {
    app.innerHTML = `
      <div class="cover-${effectiveCoverStyle}" style="background-image:url('${esc(c.background_url)}')" onclick="openLightbox('${esc(c.background_url)}')">
        <div class="cover-overlay" style="opacity:${overlayAlpha}"></div>
        <div class="hero-on-cover"><div class="signbox">${signboxInner}</div></div>
      </div>
      <div class="wrap">${belowSections}</div>`;
  } else {
    app.innerHTML = `
      ${c.background_url ? `
        <div class="cover-compact" style="background-image:url('${esc(c.background_url)}');position:relative;" onclick="openLightbox('${esc(c.background_url)}')">
          <div class="cover-overlay" style="opacity:${overlayAlpha}"></div>
        </div>` : ""}
      <div class="wrap">
        <div class="signbox">${signboxInner}</div>
        ${belowSections}
      </div>`;
  }
  loadReviewsSection(s);
}
function socialTube(soc, colorClass, slugValue){
  const meta = socialMeta(soc.platform);
  const url = socialUrl(soc.platform, soc.value);
  const sub = meta.mode === "handle" ? "@" + soc.value.replace("@","") : meta.label;
  return tube(url, colorClass, meta.label, sub, slugValue);
}
function iconBadge(soc, i, slugValue){
  const meta = socialMeta(soc.platform);
  const url = socialUrl(soc.platform, soc.value);
  const colorClass = i % 2 === 0 ? "pink" : "cyan";
  return `<a class="icon-badge ${colorClass}" href="${url}" target="_blank" rel="noreferrer" title="${esc(meta.label)}" onclick="logEvent('${slugValue}','click','${esc(meta.label)}')">${esc(meta.badge)}</a>`;
}
function portfolioCard(p){
  if (typeof p === "string") return `<div class="pc"><span>${esc(p)}</span></div>`;
  const img = p.image_url ? `<img src="${esc(p.image_url)}">` : "";
  const cap = p.caption ? `<span class="cap">${esc(p.caption)}</span>` : "";
  const cls = p.image_url ? "pc has-img" : "pc";
  const dataAttrs = p.image_url ? `data-img="${esc(p.image_url)}" data-caption="${esc(p.caption || "")}" onclick="openLightboxFromEl(this)"` : "";
  return `<div class="${cls}" ${dataAttrs}>${img}${cap}</div>`;
}
function tube(href, colorClass, label, sub, slugValue){
  return `<a class="tube ${colorClass}" href="${href}" target="_blank" rel="noreferrer" onclick="logEvent('${slugValue}','click','${esc(label)}')">
    <div class="dot"></div>
    <div><div class="l">${label}</div><div class="s">${esc(sub)}</div></div>
  </a>`;
}
function groupMenuByCategory(items){
  const groups = {};
  items.forEach(i => {
    const key = i.category && i.category.trim() ? i.category.trim() : "Items";
    (groups[key] = groups[key] || []).push(i);
  });
  return Object.keys(groups).map(cat => `
    ${Object.keys(groups).length > 1 ? `<div class="menu-cat">${esc(cat)}</div>` : ""}
    ${groups[cat].map(item => `
      <div class="menu-row">
        <span>${esc(item.name)}</span>
        ${item.price ? `<span class="p">KES ${esc(item.price)}</span>` : ""}
      </div>`).join("")}
  `).join("");
}
function vcard(c){
  const lines = ["BEGIN:VCARD","VERSION:3.0",`N:${c.name};;;;`,`FN:${c.name}`,
    c.title?`TITLE:${c.title}`:"", c.phone?`TEL;TYPE=CELL:${c.phone}`:"","END:VCARD"].filter(Boolean);
  return "data:text/vcard;charset=utf-8," + encodeURIComponent(lines.join("\n"));
}
