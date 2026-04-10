import { app, auth, db } from "../firebase/firebase-config.js";
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
  serverTimestamp,
  where,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const storage = getStorage(app);

const CASHBACK_PERCENT = 0.05;
const MIN_TICKET_AMOUNT = 50;
const MAX_TICKET_AMOUNT = 5000;

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
const reportsMessage = document.getElementById("reportsMessage");

const managerFullName = document.getElementById("managerFullName");

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
const purchaseTicketImage = document.getElementById("purchaseTicketImage");
const takeTicketPhotoBtn = document.getElementById("takeTicketPhotoBtn");
const clearTicketImageBtn = document.getElementById("clearTicketImageBtn");
const ticketPreview = document.getElementById("ticketPreview");
const ticketImageName = document.getElementById("ticketImageName");

const readTicketBtn = document.getElementById("readTicketBtn");
const ocrStatus = document.getElementById("ocrStatus");
const ocrTicketFolio = document.getElementById("ocrTicketFolio");
const ocrTicketDate = document.getElementById("ocrTicketDate");
const ocrTicketAmount = document.getElementById("ocrTicketAmount");

const visitStoreId = document.getElementById("visitStoreId");
const visitNotes = document.getElementById("visitNotes");

const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanels = document.querySelectorAll(".tab-panel");

const confirmModal = document.getElementById("confirmModal");
const confirmSummary = document.getElementById("confirmSummary");
const cancelConfirmBtn = document.getElementById("cancelConfirmBtn");
const confirmPurchaseBtn = document.getElementById("confirmPurchaseBtn");
const confirmTicketPreview = document.getElementById("confirmTicketPreview");

const reportRange = document.getElementById("reportRange");
const reportType = document.getElementById("reportType");
const loadReportsBtn = document.getElementById("loadReportsBtn");
const exportCsvBtn = document.getElementById("exportCsvBtn");
const reportsSummary = document.getElementById("reportsSummary");
const reportsTableBody = document.getElementById("reportsTableBody");

let html5QrCode = null;
let scannerRunning = false;
let managerUser = null;
let currentCustomerUid = null;
let currentCustomerData = null;
let pendingPurchaseData = null;
let lastReportRows = [];
let selectedTicketImageFile = null;
let selectedTicketImagePreview = "";
let detectedTicketData = {
  folio: "",
  ticketDate: "",
  amount: null
};

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

    const fullName =
      data.fullName ||
      `${data.firstName || ""} ${data.lastName || ""}`.trim() ||
      "Gerente";

    managerUser = {
      uid: user.uid,
      email: user.email || "",
      role,
      fullName
    };

    managerFullName.textContent = fullName;
    await loadReports();
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
    window.location.href = "login-manager.html";
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

takeTicketPhotoBtn.addEventListener("click", () => {
  purchaseTicketImage.click();
});

purchaseTicketImage.addEventListener("change", handleTicketImageChange);
clearTicketImageBtn.addEventListener("click", clearTicketImageSelection);

readTicketBtn.addEventListener("click", async () => {
  if (!selectedTicketImageFile) {
    setMessage(ocrStatus, "Primero toma o selecciona una foto del ticket.", "error");
    return;
  }

  try {
    readTicketBtn.disabled = true;
    setMessage(ocrStatus, "Leyendo ticket, espera...", "info");

    const result = await Tesseract.recognize(selectedTicketImageFile, "spa+eng");
    const rawText = result?.data?.text || "";

    const parsed = parseTicketText(rawText);
    detectedTicketData = parsed;

    ocrTicketFolio.textContent = parsed.folio || "-";
    ocrTicketDate.textContent = parsed.ticketDate || "-";
    ocrTicketAmount.textContent = parsed.amount != null ? formatMoney(parsed.amount) : "-";

    if (parsed.folio) purchaseTicketFolio.value = parsed.folio;
    if (parsed.ticketDate) purchaseTicketDate.value = parsed.ticketDate;
    if (parsed.amount != null) purchaseAmount.value = parsed.amount.toFixed(2);

    setMessage(ocrStatus, "Lectura completada. Revisa los datos detectados.", "success");
  } catch (error) {
    console.error("Error OCR:", error);
    setMessage(ocrStatus, "No se pudo leer el ticket.", "error");
  } finally {
    readTicketBtn.disabled = false;
  }
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

  if (!amount || amount < MIN_TICKET_AMOUNT || amount > MAX_TICKET_AMOUNT) {
    setMessage(
      actionMessage,
      `El monto debe estar entre $${MIN_TICKET_AMOUNT.toFixed(2)} y $${MAX_TICKET_AMOUNT.toFixed(2)}.`,
      "error"
    );
    return;
  }

  if (!waiterName) {
    setMessage(actionMessage, "El nombre del mesero es obligatorio.", "error");
    return;
  }

  if (!selectedTicketImageFile) {
    setMessage(actionMessage, "Debes cargar una foto del ticket como evidencia.", "error");
    return;
  }

  const validation = validateManualVsDetected({
    manualFolio: folio,
    manualDate: ticketDate,
    manualAmount: amount,
    detected: detectedTicketData
  });

  if (!validation.ok) {
    setMessage(
      actionMessage,
      validation.message || "Los datos ingresados no son iguales al ticket.",
      "error"
    );
    return;
  }

  const cashbackEarned = calculateCashback(amount);
  const customerFullName =
    currentCustomerData.fullName ||
    `${currentCustomerData.firstName || ""} ${currentCustomerData.lastName || ""}`.trim();

  pendingPurchaseData = {
    uid: currentCustomerUid,
    customerName: customerFullName,
    storeId,
    storeName: getStoreName(storeId),
    ticketDate,
    folio,
    amount,
    waiterName,
    notes,
    cashbackEarned,
    detectedTicketData: { ...detectedTicketData },
    ticketImageFile: selectedTicketImageFile,
    ticketImagePreview: selectedTicketImagePreview
  };

  renderConfirmSummary(pendingPurchaseData);
  openConfirmModal();
});

confirmPurchaseBtn.addEventListener("click", async () => {
  if (!pendingPurchaseData) return;

  try {
    setMessage(actionMessage, "Subiendo evidencia y registrando compra...", "info");
    confirmPurchaseBtn.disabled = true;

    const ticketImageUrl = await uploadTicketEvidence(
      pendingPurchaseData.uid,
      pendingPurchaseData.storeId,
      pendingPurchaseData.ticketDate,
      pendingPurchaseData.folio,
      pendingPurchaseData.ticketImageFile
    );

    const result = await registerPurchase({
      ...pendingPurchaseData,
      ticketImageUrl
    });

    closeConfirmModal();
    setMessage(
      actionMessage,
      `Compra registrada. +${formatMoney(result.cashbackEarned)} de dinero electrónico y +1 visita.`,
      "success"
    );

    purchaseForm.reset();
    pendingPurchaseData = null;
    clearTicketImageSelection();

    await loadCustomer(currentCustomerUid);
    await loadReports();
  } catch (error) {
    console.error(error);
    setMessage(actionMessage, error.message || "No se pudo registrar la compra.", "error");
  } finally {
    confirmPurchaseBtn.disabled = false;
  }
});

cancelConfirmBtn.addEventListener("click", () => {
  pendingPurchaseData = null;
  closeConfirmModal();
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
      customerName:
        currentCustomerData.fullName ||
        `${currentCustomerData.firstName || ""} ${currentCustomerData.lastName || ""}`.trim(),
      storeId,
      notes
    });

    setMessage(actionMessage, "Visita registrada correctamente.", "success");

    visitForm.reset();
    await loadCustomer(currentCustomerUid);
    await loadReports();
  } catch (error) {
    console.error(error);
    setMessage(actionMessage, error.message || "No se pudo registrar la visita.", "error");
  }
});

loadReportsBtn.addEventListener("click", async () => {
  await loadReports();
});

exportCsvBtn.addEventListener("click", () => {
  exportReportsToCsv();
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

  const currentBalance = Number(data.balance ?? data.points ?? 0);

  customerName.textContent =
    data.fullName ||
    `${data.firstName || ""} ${data.lastName || ""}`.trim() ||
    "-";

  customerEmail.textContent = data.email || "-";
  customerWalletId.textContent = data.walletId || generateWalletId(uid);
  customerPoints.textContent = formatMoney(currentBalance);
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
    if (typeof data.amount === "number") extra.push(`Monto: ${formatMoney(data.amount)}`);
    if (data.ticketImageUrl) extra.push(`Evidencia guardada`);

    div.innerHTML = `
      <strong>${escapeHtml(data.title || "Movimiento")}</strong>
      <p>${escapeHtml(data.description || "")}</p>
      <p>${escapeHtml(extra.join(" • "))}</p>
      <p>${formatDate(data.createdAt)}${formatBalanceChange(data.balanceChange ?? data.pointsChange)}</p>
      ${data.ticketImageUrl ? `<p><a class="report-link" href="${data.ticketImageUrl}" target="_blank" rel="noopener noreferrer">Ver evidencia</a></p>` : ""}
    `;
    historyList.appendChild(div);
  });
}

async function uploadTicketEvidence(uid, storeId, ticketDate, folio, file) {
  if (!file) throw new Error("No hay imagen del ticket para subir.");

  const safeStore = normalizeKey(storeId);
  const safeDate = ticketDate;
  const safeFolio = folio;
  const extension = getFileExtension(file.name);
  const filePath = `ticketEvidence/${uid}/${safeStore}/${safeDate}_${safeFolio}_${Date.now()}.${extension}`;

  const storageRef = ref(storage, filePath);
  await uploadBytes(storageRef, file);
  return await getDownloadURL(storageRef);
}

function handleTicketImageChange(event) {
  const file = event.target.files?.[0];

  if (!file) {
    clearTicketImageSelection();
    return;
  }

  selectedTicketImageFile = file;
  ticketImageName.textContent = file.name;

  const reader = new FileReader();
  reader.onload = () => {
    selectedTicketImagePreview = reader.result;
    ticketPreview.src = selectedTicketImagePreview;
    ticketPreview.classList.remove("hidden");
  };
  reader.readAsDataURL(file);
}

function clearTicketImageSelection() {
  selectedTicketImageFile = null;
  selectedTicketImagePreview = "";
  detectedTicketData = {
    folio: "",
    ticketDate: "",
    amount: null
  };

  purchaseTicketImage.value = "";
  ticketImageName.textContent = "Ningún archivo seleccionado";
  ticketPreview.src = "";
  ticketPreview.classList.add("hidden");
  confirmTicketPreview.src = "";
  confirmTicketPreview.classList.add("hidden");

  ocrTicketFolio.textContent = "-";
  ocrTicketDate.textContent = "-";
  ocrTicketAmount.textContent = "-";
  setMessage(ocrStatus, "Sin lectura aún.", "info");
}

async function registerPurchase({
  uid,
  customerName,
  storeId,
  storeName,
  ticketDate,
  folio,
  amount,
  waiterName,
  notes,
  cashbackEarned,
  detectedTicketData,
  ticketImageUrl
}) {
  const ticketKey = buildTicketKey(storeId, ticketDate, folio);

  const userRef = doc(db, "users", uid);
  const ticketRef = doc(db, "usedTickets", ticketKey);
  const movementRef = doc(collection(db, "users", uid, "movements"));
  const logRef = doc(collection(db, "managerLogs"));

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
    const currentBalance = Number(userData.balance ?? userData.points ?? 0);
    const currentVisits = userData.visits ?? 0;
    const newBalance = Number((currentBalance + cashbackEarned).toFixed(2));
    const newVisits = currentVisits + 1;
    const newLevel = calculateLevel(newBalance, newVisits);

    transaction.update(userRef, {
      balance: newBalance,
      points: newBalance,
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
      cashbackEarned,
      balanceEarned: cashbackEarned,
      detectedTicketData: detectedTicketData || {},
      ticketImageUrl: ticketImageUrl || "",
      managerUid: managerUser.uid,
      managerEmail: managerUser.email,
      managerName: managerUser.fullName,
      createdAt: serverTimestamp(),
      notes: notes || ""
    });

    transaction.set(movementRef, {
      type: "purchase",
      title: "Compra registrada",
      description: `Compra validada en ${storeName} con folio ${folio}.`,
      balanceChange: cashbackEarned,
      pointsChange: cashbackEarned,
      visitAdded: true,
      amount,
      ticketFolio: folio,
      ticketDate,
      storeId,
      storeName,
      waiterName,
      detectedTicketData: detectedTicketData || {},
      ticketImageUrl: ticketImageUrl || "",
      createdAt: serverTimestamp(),
      managerUid: managerUser.uid,
      managerEmail: managerUser.email,
      managerName: managerUser.fullName,
      notes: notes || ""
    });

    transaction.set(logRef, {
      type: "purchase",
      createdAt: serverTimestamp(),
      managerUid: managerUser.uid,
      managerEmail: managerUser.email,
      managerName: managerUser.fullName,
      customerUid: uid,
      customerName,
      storeId,
      storeName,
      ticketDate,
      ticketFolio: folio,
      amount,
      waiterName,
      detectedTicketData: detectedTicketData || {},
      ticketImageUrl: ticketImageUrl || "",
      cashbackEarned,
      balanceEarned: cashbackEarned,
      pointsEarned: cashbackEarned,
      notes: notes || ""
    });
  });

  return { cashbackEarned };
}

async function registerVisit({ uid, customerName, storeId, notes }) {
  const storeName = getStoreName(storeId);
  const visitDate = getTodayDateIso();
  const visitKey = `${uid}_${visitDate}_${normalizeKey(storeId)}`;

  const userRef = doc(db, "users", uid);
  const visitRef = doc(db, "validatedVisits", visitKey);
  const movementRef = doc(collection(db, "users", uid, "movements"));
  const logRef = doc(collection(db, "managerLogs"));

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
    const currentBalance = Number(userData.balance ?? userData.points ?? 0);
    const currentVisits = userData.visits ?? 0;
    const newVisits = currentVisits + 1;
    const newLevel = calculateLevel(currentBalance, newVisits);

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
      managerName: managerUser.fullName,
      createdAt: serverTimestamp(),
      notes: notes || ""
    });

    transaction.set(movementRef, {
      type: "visit",
      title: "Visita registrada",
      description: `Visita validada en ${storeName} sin compra.`,
      balanceChange: 0,
      pointsChange: 0,
      visitAdded: true,
      storeId,
      storeName,
      visitDate,
      createdAt: serverTimestamp(),
      managerUid: managerUser.uid,
      managerEmail: managerUser.email,
      managerName: managerUser.fullName,
      notes: notes || ""
    });

    transaction.set(logRef, {
      type: "visit",
      createdAt: serverTimestamp(),
      managerUid: managerUser.uid,
      managerEmail: managerUser.email,
      managerName: managerUser.fullName,
      customerUid: uid,
      customerName,
      storeId,
      storeName,
      ticketDate: "",
      ticketFolio: "",
      amount: 0,
      waiterName: "",
      ticketImageUrl: "",
      cashbackEarned: 0,
      balanceEarned: 0,
      pointsEarned: 0,
      notes: notes || ""
    });
  });
}

async function loadReports() {
  try {
    setMessage(reportsMessage, "Cargando reporte...", "info");

    const range = getRangeDates(reportRange.value);
    const logsRef = collection(db, "managerLogs");

    const logsQuery = query(
      logsRef,
      where("createdAt", ">=", Timestamp.fromDate(range.start)),
      where("createdAt", "<=", Timestamp.fromDate(range.end)),
      orderBy("createdAt", "desc"),
      limit(500)
    );

    const snapshot = await getDocs(logsQuery);
    let rows = snapshot.docs.map(docItem => docItem.data());

    if (reportType.value !== "all") {
      rows = rows.filter(item => item.type === reportType.value);
    }

    lastReportRows = rows;
    renderReports(rows);
    setMessage(reportsMessage, `Reporte cargado: ${rows.length} registros.`, "success");
  } catch (error) {
    console.error("Error cargando reportes:", error);
    setMessage(reportsMessage, "No se pudo cargar el reporte.", "error");
  }
}

function renderReports(rows) {
  reportsTableBody.innerHTML = "";

  if (!rows.length) {
    reportsTableBody.innerHTML = `
      <tr>
        <td colspan="11" class="empty-row">No hay registros para este periodo.</td>
      </tr>
    `;
    reportsSummary.textContent = "Sin registros para el filtro seleccionado.";
    return;
  }

  let totalCashback = 0;
  let totalAmount = 0;

  rows.forEach((row) => {
    const earned = Number(row.cashbackEarned ?? row.balanceEarned ?? row.pointsEarned ?? 0);
    totalCashback += earned;
    totalAmount += Number(row.amount || 0);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(formatDate(row.createdAt))}</td>
      <td>${escapeHtml(row.managerName || "-")}</td>
      <td>${escapeHtml(row.customerName || "-")}</td>
      <td>${escapeHtml(getTypeLabel(row.type))}</td>
      <td>${escapeHtml(row.storeName || "-")}</td>
      <td>${escapeHtml(row.ticketFolio || "-")}</td>
      <td>${escapeHtml(row.ticketDate || "-")}</td>
      <td>${formatMoney(row.amount || 0)}</td>
      <td>${escapeHtml(row.waiterName || "-")}</td>
      <td>${formatMoney(earned)}</td>
      <td>
        ${row.ticketImageUrl ? `<a class="report-link" href="${row.ticketImageUrl}" target="_blank" rel="noopener noreferrer">Ver ticket</a>` : "-"}
      </td>
    `;
    reportsTableBody.appendChild(tr);
  });

  reportsSummary.textContent =
    `Registros: ${rows.length} • Dinero electrónico otorgado: ${formatMoney(totalCashback)} • Monto acumulado: ${formatMoney(totalAmount)}`;
}

function exportReportsToCsv() {
  if (!lastReportRows.length) {
    setMessage(reportsMessage, "No hay datos para exportar.", "error");
    return;
  }

  const headers = [
    "Fecha y hora",
    "Gerente",
    "Cliente",
    "Tipo",
    "Sucursal",
    "Folio",
    "Fecha ticket",
    "Monto",
    "Mesero",
    "Dinero electronico",
    "Evidencia"
  ];

  const lines = lastReportRows.map((row) => {
    const earned = row.cashbackEarned ?? row.balanceEarned ?? row.pointsEarned ?? 0;

    return [
      formatDate(row.createdAt),
      row.managerName || "",
      row.customerName || "",
      getTypeLabel(row.type),
      row.storeName || "",
      row.ticketFolio || "",
      row.ticketDate || "",
      row.amount || 0,
      row.waiterName || "",
      earned,
      row.ticketImageUrl || ""
    ];
  });

  const csvContent = [
    headers.join(","),
    ...lines.map(line =>
      line.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")
    )
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `reporte_manager_${reportRange.value}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function renderConfirmSummary(data) {
  confirmSummary.innerHTML = `
    <div class="confirm-item"><span>Cliente</span><strong>${escapeHtml(data.customerName || "-")}</strong></div>
    <div class="confirm-item"><span>Sucursal</span><strong>${escapeHtml(data.storeName)}</strong></div>
    <div class="confirm-item"><span>Fecha del ticket</span><strong>${escapeHtml(data.ticketDate)}</strong></div>
    <div class="confirm-item"><span>Folio</span><strong>${escapeHtml(data.folio)}</strong></div>
    <div class="confirm-item"><span>Monto</span><strong>${formatMoney(data.amount)}</strong></div>
    <div class="confirm-item"><span>Mesero</span><strong>${escapeHtml(data.waiterName)}</strong></div>
    <div class="confirm-item"><span>Dinero electrónico a otorgar</span><strong>${formatMoney(data.cashbackEarned)}</strong></div>
    <div class="confirm-item"><span>Gerente</span><strong>${escapeHtml(managerUser?.fullName || "-")}</strong></div>
  `;

  if (data.ticketImagePreview) {
    confirmTicketPreview.src = data.ticketImagePreview;
    confirmTicketPreview.classList.remove("hidden");
  } else {
    confirmTicketPreview.src = "";
    confirmTicketPreview.classList.add("hidden");
  }
}

function openConfirmModal() {
  confirmModal.classList.remove("hidden");
}

function closeConfirmModal() {
  confirmModal.classList.add("hidden");
}

function parseTicketText(rawText) {
  const text = normalizeOcrText(rawText);

  const folio = extractTicketFolio(text);
  const ticketDate = extractTicketDate(text);
  const amount = extractTicketAmount(text);

  return { folio, ticketDate, amount };
}

function normalizeOcrText(text) {
  return String(text)
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function extractTicketFolio(text) {
  const lines = text.split("\n").map(line => line.trim()).filter(Boolean);

  for (const line of lines) {
    const lower = line.toLowerCase();

    if (
      lower.includes("folio") ||
      lower.includes("ticket") ||
      lower.includes("nota")
    ) {
      const match = line.match(/\b(\d{5})\b/);
      if (match) return match[1];
    }
  }

  for (const line of lines.slice(0, 12)) {
    const match = line.match(/\b(\d{5})\b/);
    if (match) return match[1];
  }

  return "";
}

function extractTicketDate(text) {
  const match =
    text.match(/\b(20\d{2})[-\/](\d{2})[-\/](\d{2})\b/) ||
    text.match(/\b(\d{2})[-\/](\d{2})[-\/](20\d{2})\b/);

  if (!match) return "";

  if (match[1].length === 4) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }

  return `${match[3]}-${match[2]}-${match[1]}`;
}

function extractTicketAmount(text) {
  const lines = text.split("\n").map(line => line.trim()).filter(Boolean);
  const candidates = [];

  for (const line of lines) {
    const lower = line.toLowerCase();

    if (
      lower.includes("total") ||
      lower.includes("importe") ||
      lower.includes("pago")
    ) {
      const amounts = [...line.matchAll(/(\d+[.,]\d{2})/g)].map(m => parseAmount(m[1]));
      candidates.push(...amounts.filter(n => !Number.isNaN(n)));
    }
  }

  if (!candidates.length) {
    const allAmounts = [...text.matchAll(/(\d+[.,]\d{2})/g)].map(m => parseAmount(m[1]));
    const valid = allAmounts.filter(n => !Number.isNaN(n));
    if (valid.length) return Math.max(...valid);
    return null;
  }

  return Math.max(...candidates);
}

function parseAmount(value) {
  return Number(String(value).replace(",", "."));
}

function validateManualVsDetected({ manualFolio, manualDate, manualAmount, detected }) {
  if (!detected.folio && !detected.ticketDate && detected.amount == null) {
    return {
      ok: false,
      message: "Primero debes leer el ticket para validar los datos."
    };
  }

  if (detected.folio && manualFolio !== detected.folio) {
    return {
      ok: false,
      message: "Los datos que ingresaste no son iguales al ticket: el folio no coincide."
    };
  }

  if (detected.ticketDate && manualDate !== detected.ticketDate) {
    return {
      ok: false,
      message: "Los datos que ingresaste no son iguales al ticket: la fecha no coincide."
    };
  }

  if (detected.amount != null) {
    const diff = Math.abs(Number(manualAmount) - Number(detected.amount));
    if (diff > 0.01) {
      return {
        ok: false,
        message: "Los datos que ingresaste no son iguales al ticket: el monto no coincide."
      };
    }
  }

  return { ok: true };
}

function getFileExtension(fileName) {
  const parts = String(fileName).split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : "jpg";
}

function calculateCashback(amount) {
  return Number((Number(amount) * CASHBACK_PERCENT).toFixed(2));
}

function calculateLevel(balance, visits) {
  if (balance >= 200 || visits >= 15) return "Gold";
  if (balance >= 100 || visits >= 8) return "Silver";
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

function getRangeDates(range) {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (range === "week") {
    const day = start.getDay();
    const diff = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - diff);
  }

  if (range === "month") {
    start.setDate(1);
  }

  return { start, end };
}

function getTypeLabel(type) {
  switch (type) {
    case "purchase":
      return "Compra";
    case "visit":
      return "Visita";
    case "redeem":
      return "Canje";
    default:
      return type || "-";
  }
}

function generateWalletId(uid) {
  return `AB-${uid.substring(0, 6).toUpperCase()}`;
}

function formatDate(timestamp) {
  if (!timestamp || !timestamp.toDate) return "Fecha pendiente";
  return timestamp.toDate().toLocaleString("es-MX");
}

function formatMoney(value) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN"
  }).format(Number(value || 0));
}

function formatBalanceChange(value) {
  if (!value) return "";
  const numeric = Number(value || 0);
  const sign = numeric > 0 ? "+" : "";
  return ` • ${sign}${formatMoney(numeric)}`;
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