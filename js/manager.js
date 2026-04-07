import { auth, db } from "../firebase/firebase-config.js";
import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  doc,
  getDoc,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const POINTS_DIVISOR = 20;

const STORES = [
  { id: "applebees_torres", name: "Applebee's Torres" },
  { id: "applebees_tecnologico", name: "Applebee's Tecnológico" },
  { id: "applebees_triunfo", name: "Applebee's Triunfo" }
];

const logoutBtn = document.getElementById("logoutBtn");
const startScannerBtn = document.getElementById("startScannerBtn");
const stopScannerBtn = document.getElementById("stopScannerBtn");
const loadManualQrBtn = document.getElementById("loadManualQrBtn");
const manualQrInput = document.getElementById("manualQrInput");
const scannerMessage = document.getElementById("scannerMessage");
const actionMessage = document.getElementById("actionMessage");

const customerName = document.getElementById("customerName");
const customerEmail = document.getElementById("customerEmail");
const customerWalletId = document.getElementById("customerWalletId");
const customerPoints = document.getElementById("customerPoints");
const customerVisits = document.getElementById("customerVisits");
const customerLevel = document.getElementById("customerLevel");
const customerState = document.getElementById("customerState");
const historyList = document.getElementById("historyList");

const purchaseForm = document.getElementById("purchaseForm");
const visitForm = document.getElementById("visitForm");

const purchaseStoreId = document.getElementById("purchaseStoreId");
const purchaseTicketDate = document.getElementById("purchaseTicketDate");
const purchaseTicketFolio = document.getElementById("purchaseTicketFolio");
const purchaseAmount = document.getElementById("purchaseAmount");
const purchaseWaiterName = document.getElementById("purchaseWaiterName");
const purchaseNotes = document.getElementById("purchaseNotes");

const visitStoreId = document.getElementById("visitStoreId");
const visitNotes = document.getElementById("visitNotes");

const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanels = document.querySelectorAll(".tab-panel");

let html5QrCode = null;
let scannerRunning = false;
let managerUser = null;
let currentCustomerUid = null;
let currentCustomerData = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login-manager.html";
    return;
  }

  try {
    const managerRef = doc(db, "users", user.uid);
    const managerSnap = await getDoc(managerRef);

    if (!managerSnap.exists()) {
      alert("No tienes acceso a este panel.");
      window.location.href = "login-manager.html";
      return;
    }

    const data = managerSnap.data();
    const role = data.role || "customer";

    if (!["manager", "admin"].includes(role)) {
      alert("Acceso restringido. Este panel es solo para gerente o admin.");
      window.location.href = "login-manager.html";
      return;
    }

    managerUser = {
      uid: user.uid,
      email: user.email || "",
      role
    };
  } catch (error) {
    console.error("Error validando gerente:", error);
    alert("No se pudo validar el acceso.");
    window.location.href = "login-manager.html";
  }
});

startScannerBtn.addEventListener("click", startScanner);
stopScannerBtn.addEventListener("click", stopScanner);

loadManualQrBtn.addEventListener("click", async () => {
  const raw = manualQrInput.value.trim();
  if (!raw) {
    setMessage(scannerMessage, "Pega primero el contenido del QR.", "error");
    return;
  }
  await handleQrPayload(raw);
});

logoutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
    window.location.href = "index.html";
  } catch (error) {
    console.error(error);
    alert("No se pudo cerrar sesión.");
  }
});

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.tab;

    tabButtons.forEach((b) => b.classList.remove("active"));
    tabPanels.forEach((p) => p.classList.remove("active"));

    btn.classList.add("active");
    document.getElementById(target).classList.add("active");
  });
});

purchaseTicketFolio.addEventListener("input", () => {
  purchaseTicketFolio.value = purchaseTicketFolio.value.replace(/\D/g, "").slice(0, 5);
});

purchaseWaiterName.addEventListener("input", () => {
  purchaseWaiterName.value = normalizePersonName(purchaseWaiterName.value);
});

purchaseForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!currentCustomerUid || !currentCustomerData) {
    setMessage(actionMessage, "Primero debes cargar un cliente.", "error");
    return;
  }

  const storeId = purchaseStoreId.value;
  const ticketDate = purchaseTicketDate.value;
  const folio = purchaseTicketFolio.value.trim();
  const amount = Number(purchaseAmount.value);
  const waiterName = normalizePersonName(purchaseWaiterName.value);
  const notes = purchaseNotes.value.trim();

  if (!isValidStore(storeId)) {
    setMessage(actionMessage, "Selecciona una sucursal válida.", "error");
    return;
  }

  if (!isValidTicketDate(ticketDate)) {
    setMessage(actionMessage, "La fecha del ticket no es válida o es futura.", "error");
    return;
  }

  if (!/^\d{5}$/.test(folio)) {
    setMessage(actionMessage, "El folio debe tener exactamente 5 números.", "error");
    return;
  }

  if (!amount || amount <= 0) {
    setMessage(actionMessage, "Ingresa un monto válido.", "error");
    return;
  }

  if (!waiterName) {
    setMessage(actionMessage, "El nombre del mesero es obligatorio.", "error");
    return;
  }

  try {
    setMessage(actionMessage, "Registrando compra...", "info");

    const result = await registerPurchase({
      uid: currentCustomerUid,
      storeId,
      ticketDate,
      folio,
      amount,
      waiterName,
      notes
    });

    setMessage(
      actionMessage,
      `Compra registrada. +${result.pointsEarned} puntos y +1 visita.`,
      "success"
    );

    purchaseForm.reset();
    await loadCustomer(currentCustomerUid);

  } catch (error) {
    console.error(error);
    setMessage(actionMessage, error.message || "No se pudo registrar la compra.", "error");
  }
});

visitForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!currentCustomerUid || !currentCustomerData) {
    setMessage(actionMessage, "Primero debes cargar un cliente.", "error");
    return;
  }

  const storeId = visitStoreId.value;
  const notes = visitNotes.value.trim();

  if (!isValidStore(storeId)) {
    setMessage(actionMessage, "Selecciona una sucursal válida.", "error");
    return;
  }

  try {
    setMessage(actionMessage, "Registrando visita...", "info");

    await registerVisit({
      uid: currentCustomerUid,
      storeId,
      notes
    });

    setMessage(actionMessage, "Visita registrada correctamente.", "success");

    visitForm.reset();
    await loadCustomer(currentCustomerUid);

  } catch (error) {
    console.error(error);
    setMessage(actionMessage, error.message || "No se pudo registrar la visita.", "error");
  }
});

async function startScanner() {
  if (scannerRunning) return;

  if (typeof Html5Qrcode === "undefined") {
    setMessage(scannerMessage, "No cargó la librería del escáner.", "error");
    return;
  }

  try {
    html5QrCode = new Html5Qrcode("reader");
    await html5QrCode.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: 240 },
      async (decodedText) => {
        await handleQrPayload(decodedText);
        await stopScanner();
      },
      () => {}
    );

    scannerRunning = true;
    setMessage(scannerMessage, "Escáner activo. Apunta al QR del cliente.", "success");
  } catch (error) {
    console.error(error);
    setMessage(scannerMessage, "No se pudo iniciar la cámara.", "error");
  }
}

async function stopScanner() {
  if (!scannerRunning || !html5QrCode) return;

  try {
    await html5QrCode.stop();
    await html5QrCode.clear();
    scannerRunning = false;
    setMessage(scannerMessage, "Escáner detenido.", "info");
  } catch (error) {
    console.error(error);
  }
}

async function handleQrPayload(raw) {
  try {
    let parsed;

    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("El QR no contiene JSON válido.");
    }

    if (!parsed.uid) {
      throw new Error("El QR no contiene uid del cliente.");
    }

    await loadCustomer(parsed.uid);
    setMessage(scannerMessage, "Cliente cargado correctamente.", "success");
  } catch (error) {
    console.error(error);
    setMessage(scannerMessage, error.message || "QR inválido.", "error");
  }
}

async function loadCustomer(uid) {
  const userRef = doc(db, "users", uid);
  const snap = await getDoc(userRef);

  if (!snap.exists()) {
    throw new Error("Cliente no encontrado.");
  }

  const data = snap.data();
  currentCustomerUid = uid;
  currentCustomerData = data;

  customerName.textContent = data.fullName || `${data.firstName || ""} ${data.lastName || ""}`.trim() || "-";
  customerEmail.textContent = data.email || "-";
  customerWalletId.textContent = data.walletId || generateWalletId(uid);
  customerPoints.textContent = data.points ?? 0;
  customerVisits.textContent = data.visits ?? 0;
  customerLevel.textContent = data.level || "Classic";
  customerState.textContent = "Cliente listo para operación.";

  await loadCustomerHistory(uid);
}

async function loadCustomerHistory(uid) {
  const q = query(
    collection(db, "users", uid, "movements"),
    orderBy("createdAt", "desc"),
    limit(10)
  );

  const snap = await getDocs(q);
  historyList.innerHTML = "";

  if (snap.empty) {
    historyList.innerHTML = `<div class="empty-state">Este cliente aún no tiene movimientos.</div>`;
    return;
  }

  snap.forEach((item) => {
    const data = item.data();
    const div = document.createElement("div");
    div.className = "history-item";

    const extra = [];

    if (data.storeName) extra.push(`Sucursal: ${data.storeName}`);
    if (data.ticketDate) extra.push(`Fecha ticket: ${data.ticketDate}`);
    if (data.ticketFolio) extra.push(`Folio: ${data.ticketFolio}`);
    if (data.waiterName) extra.push(`Mesero: ${data.waiterName}`);
    if (typeof data.amount === "number") extra.push(`Monto: $${data.amount.toFixed(2)}`);

    div.innerHTML = `
      <strong>${escapeHtml(data.title || "Movimiento")}</strong>
      <p>${escapeHtml(data.description || "")}</p>
      <p>${escapeHtml(extra.join(" • "))}</p>
      <p>${formatDate(data.createdAt)}${formatPoints(data.pointsChange)}</p>
    `;
    historyList.appendChild(div);
  });
}

async function registerPurchase({ uid, storeId, ticketDate, folio, amount, waiterName, notes }) {
  const storeName = getStoreName(storeId);
  const ticketKey = buildTicketKey(storeId, ticketDate, folio);

  const userRef = doc(db, "users", uid);
  const ticketRef = doc(db, "usedTickets", ticketKey);
  const movementRef = doc(collection(db, "users", uid, "movements"));

  const pointsEarned = calculatePoints(amount);

  await runTransaction(db, async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists()) {
      throw new Error("El cliente no existe.");
    }

    const ticketSnap = await transaction.get(ticketRef);
    if (ticketSnap.exists()) {
      throw new Error("Este ticket ya fue registrado para esa sucursal y esa fecha.");
    }

    const userData = userSnap.data();
    const currentPoints = userData.points ?? 0;
    const currentVisits = userData.visits ?? 0;
    const newPoints = currentPoints + pointsEarned;
    const newVisits = currentVisits + 1;
    const newLevel = calculateLevel(newPoints, newVisits);

    transaction.update(userRef, {
      points: newPoints,
      visits: newVisits,
      level: newLevel,
      updatedAt: serverTimestamp()
    });

    transaction.set(ticketRef, {
      ticketKey,
      uid,
      folio,
      storeId,
      storeName,
      ticketDate,
      waiterName,
      amount,
      pointsEarned,
      managerUid: managerUser.uid,
      managerEmail: managerUser.email,
      createdAt: serverTimestamp(),
      notes: notes || ""
    });

    transaction.set(movementRef, {
      type: "purchase",
      title: "Compra registrada",
      description: `Compra validada en ${storeName} con folio ${folio}.`,
      pointsChange: pointsEarned,
      visitAdded: true,
      amount,
      ticketFolio: folio,
      ticketDate,
      storeId,
      storeName,
      waiterName,
      createdAt: serverTimestamp(),
      managerUid: managerUser.uid,
      managerEmail: managerUser.email,
      notes: notes || ""
    });
  });

  return { pointsEarned };
}

async function registerVisit({ uid, storeId, notes }) {
  const storeName = getStoreName(storeId);
  const visitDate = getTodayDateIso();
  const visitKey = `${uid}_${visitDate}_${normalizeKey(storeId)}`;

  const userRef = doc(db, "users", uid);
  const visitRef = doc(db, "validatedVisits", visitKey);
  const movementRef = doc(collection(db, "users", uid, "movements"));

  await runTransaction(db, async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists()) {
      throw new Error("El cliente no existe.");
    }

    const visitSnap = await transaction.get(visitRef);
    if (visitSnap.exists()) {
      throw new Error("Este cliente ya tiene una visita registrada hoy en esta sucursal.");
    }

    const userData = userSnap.data();
    const currentPoints = userData.points ?? 0;
    const currentVisits = userData.visits ?? 0;
    const newVisits = currentVisits + 1;
    const newLevel = calculateLevel(currentPoints, newVisits);

    transaction.update(userRef, {
      visits: newVisits,
      level: newLevel,
      updatedAt: serverTimestamp()
    });

    transaction.set(visitRef, {
      visitKey,
      uid,
      storeId,
      storeName,
      visitDate,
      managerUid: managerUser.uid,
      managerEmail: managerUser.email,
      createdAt: serverTimestamp(),
      notes: notes || ""
    });

    transaction.set(movementRef, {
      type: "visit",
      title: "Visita registrada",
      description: `Visita validada en ${storeName} sin compra.`,
      pointsChange: 0,
      visitAdded: true,
      storeId,
      storeName,
      visitDate,
      createdAt: serverTimestamp(),
      managerUid: managerUser.uid,
      managerEmail: managerUser.email,
      notes: notes || ""
    });
  });
}

function calculatePoints(amount) {
  return Math.floor(amount / POINTS_DIVISOR);
}

function calculateLevel(points, visits) {
  if (points >= 200 || visits >= 15) return "Gold";
  if (points >= 100 || visits >= 8) return "Silver";
  return "Classic";
}

function buildTicketKey(storeId, ticketDate, folio) {
  return `${normalizeKey(storeId)}_${ticketDate}_${folio}`;
}

function normalizeKey(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\w\-]/g, "");
}

function normalizePersonName(value) {
  return String(value)
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function isValidStore(storeId) {
  return STORES.some(store => store.id === storeId);
}

function getStoreName(storeId) {
  return STORES.find(store => store.id === storeId)?.name || storeId;
}

function isValidTicketDate(value) {
  if (!value) return false;
  const selected = new Date(`${value}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return !Number.isNaN(selected.getTime()) && selected <= today;
}

function getTodayDateIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function generateWalletId(uid) {
  return `AB-${uid.substring(0, 6).toUpperCase()}`;
}

function formatDate(timestamp) {
  if (!timestamp || !timestamp.toDate) return "Fecha pendiente";
  const date = timestamp.toDate();
  return date.toLocaleString("es-MX");
}

function formatPoints(value) {
  if (!value) return "";
  const sign = value > 0 ? "+" : "";
  return ` • ${sign}${value} pts`;
}

function setMessage(element, text, type) {
  element.textContent = text;
  element.style.color =
    type === "success" ? "#52d49b" :
    type === "error" ? "#ff7e8f" :
    type === "info" ? "#d8e44a" :
    "#b7c2cf";
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
