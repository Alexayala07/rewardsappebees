import { auth, db } from "../firebase/firebase-config.js";
import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  doc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
  getDocs,
  increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const userName = document.getElementById("userName");
const walletFullName = document.getElementById("walletFullName");
const userPoints = document.getElementById("userPoints");
const userVisits = document.getElementById("userVisits");
const userLevel = document.getElementById("userLevel");
const walletId = document.getElementById("walletId");

const profileForm = document.getElementById("profileForm");
const profileFirstName = document.getElementById("profileFirstName");
const profileLastName = document.getElementById("profileLastName");
const profileEmail = document.getElementById("profileEmail");
const profilePhone = document.getElementById("profilePhone");
const profileCity = document.getElementById("profileCity");
const profileBirthday = document.getElementById("profileBirthday");
const profileMessage = document.getElementById("profileMessage");

const summaryPoints = document.getElementById("summaryPoints");
const summaryVisits = document.getElementById("summaryVisits");
const summaryLevel = document.getElementById("summaryLevel");

const qrImage = document.getElementById("qrImage");
const logoutBtn = document.getElementById("logoutBtn");

const addPointsBtn = document.getElementById("addPointsBtn");
const removePointsBtn = document.getElementById("removePointsBtn");
const addVisitBtn = document.getElementById("addVisitBtn");

const activityList = document.getElementById("activityList");

let currentUser = null;
let currentUserData = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUser = user;
  await loadUserProfile();
  await loadMovements();
});

async function loadUserProfile() {
  try {
    const userRef = doc(db, "users", currentUser.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      window.location.href = "index.html";
      return;
    }

    currentUserData = userSnap.data();

    const firstName = currentUserData.firstName || "";
    const lastName = currentUserData.lastName || "";
    const fullName = currentUserData.fullName || `${firstName} ${lastName}`.trim() || "Usuario Applebee’s";
    const email = currentUserData.email || currentUser.email || "-";
    const phone = currentUserData.phone || "";
    const city = currentUserData.city || "";
    const birthday = currentUserData.birthday || "";
    const points = currentUserData.points ?? 0;
    const visits = currentUserData.visits ?? 0;
    const level = currentUserData.level || "Classic";
    const digitalId = currentUserData.walletId && currentUserData.walletId.trim() !== ""
      ? currentUserData.walletId
      : generateWalletId(currentUser.uid);

    userName.textContent = firstName || "Usuario";
    walletFullName.textContent = fullName;
    userPoints.textContent = points;
    userVisits.textContent = visits;
    userLevel.textContent = level;
    walletId.textContent = digitalId;

    summaryPoints.textContent = points;
    summaryVisits.textContent = visits;
    summaryLevel.textContent = level;

    profileFirstName.value = firstName;
    profileLastName.value = lastName;
    profileEmail.value = email;
    profilePhone.value = phone;
    profileCity.value = city;
    profileBirthday.value = birthday;

    const qrData = JSON.stringify({
      uid: currentUser.uid,
      email,
      fullName,
      walletId: digitalId,
      brand: "Applebees"
    });

    qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrData)}`;

  } catch (error) {
    console.error("Error cargando perfil:", error);
  }
}

profileForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!currentUser) return;

  const firstName = profileFirstName.value.trim();
  const lastName = profileLastName.value.trim();
  const phone = profilePhone.value.trim();
  const city = profileCity.value.trim();
  const birthday = profileBirthday.value;

  clearProfileMessage();

  if (!firstName || !lastName) {
    showProfileMessage("Nombre y apellido son obligatorios.", "error");
    return;
  }

  try {
    const fullName = `${firstName} ${lastName}`.trim();
    const userRef = doc(db, "users", currentUser.uid);

    await updateDoc(userRef, {
      firstName,
      lastName,
      fullName,
      phone,
      city,
      birthday,
      updatedAt: serverTimestamp()
    });

    await addMovement("profile", "Perfil actualizado", "Tus datos personales fueron actualizados.");

    showProfileMessage("Perfil actualizado correctamente.", "success");
    await loadUserProfile();
    await loadMovements();

  } catch (error) {
    console.error("Error actualizando perfil:", error);
    showProfileMessage("No se pudo actualizar el perfil.", "error");
  }
});

addPointsBtn.addEventListener("click", async () => {
  await updatePoints(10, "add", "Puntos agregados", "Se agregaron 10 puntos al saldo.");
});

removePointsBtn.addEventListener("click", async () => {
  const currentPoints = currentUserData?.points ?? 0;

  if (currentPoints < 10) {
    alert("No hay puntos suficientes para descontar 10.");
    return;
  }

  await updatePoints(-10, "remove", "Puntos descontados", "Se descontaron 10 puntos del saldo.");
});

addVisitBtn.addEventListener("click", async () => {
  if (!currentUser) return;

  try {
    const userRef = doc(db, "users", currentUser.uid);
    const newVisits = (currentUserData?.visits ?? 0) + 1;
    const newLevel = calculateLevel(currentUserData?.points ?? 0, newVisits);

    await updateDoc(userRef, {
      visits: increment(1),
      level: newLevel,
      updatedAt: serverTimestamp()
    });

    await addMovement("visit", "Nueva visita registrada", "Se registró una visita adicional en tu cuenta.");

    await loadUserProfile();
    await loadMovements();

  } catch (error) {
    console.error("Error agregando visita:", error);
    alert("No se pudo registrar la visita.");
  }
});

async function updatePoints(amount, type, title, description) {
  if (!currentUser) return;

  try {
    const currentPoints = currentUserData?.points ?? 0;
    const currentVisits = currentUserData?.visits ?? 0;
    const newPoints = currentPoints + amount;
    const newLevel = calculateLevel(newPoints, currentVisits);

    const userRef = doc(db, "users", currentUser.uid);

    await updateDoc(userRef, {
      points: increment(amount),
      level: newLevel,
      updatedAt: serverTimestamp()
    });

    await addMovement(type, title, description, amount);

    await loadUserProfile();
    await loadMovements();

  } catch (error) {
    console.error("Error actualizando puntos:", error);
    alert("No se pudieron actualizar los puntos.");
  }
}

async function addMovement(type, title, description, pointsChange = 0) {
  if (!currentUser) return;

  try {
    const movementsRef = collection(db, "users", currentUser.uid, "movements");

    await addDoc(movementsRef, {
      type,
      title,
      description,
      pointsChange,
      createdAt: serverTimestamp()
    });

  } catch (error) {
    console.error("Error guardando movimiento:", error);
  }
}

async function loadMovements() {
  if (!currentUser) return;

  try {
    const movementsRef = collection(db, "users", currentUser.uid, "movements");
    const q = query(movementsRef, orderBy("createdAt", "desc"), limit(10));
    const snapshot = await getDocs(q);

    activityList.innerHTML = "";

    if (snapshot.empty) {
      activityList.innerHTML = `
        <div class="empty-state">
          Aún no hay movimientos registrados.
        </div>
      `;
      return;
    }

    snapshot.forEach((docItem) => {
      const data = docItem.data();
      const iconClass = getMovementIcon(data.type);
      const dateText = formatDate(data.createdAt);

      const item = document.createElement("div");
      item.className = "activity-item";
      item.innerHTML = `
        <div class="activity-icon ${iconClass}"></div>
        <div>
          <strong>${escapeHtml(data.title || "Movimiento")}</strong>
          <p>${escapeHtml(data.description || "")}</p>
          <p>${dateText}${formatPointsChange(data.pointsChange)}</p>
        </div>
      `;

      activityList.appendChild(item);
    });

  } catch (error) {
    console.error("Error cargando movimientos:", error);
    activityList.innerHTML = `
      <div class="empty-state">
        No se pudo cargar el historial.
      </div>
    `;
  }
}

logoutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
    window.location.href = "index.html";
  } catch (error) {
    console.error("Error al cerrar sesión:", error);
    alert("No se pudo cerrar sesión.");
  }
});

function generateWalletId(uid) {
  return `AB-${uid.substring(0, 6).toUpperCase()}`;
}

function calculateLevel(points, visits) {
  if (points >= 200 || visits >= 15) return "Gold";
  if (points >= 100 || visits >= 8) return "Silver";
  return "Classic";
}

function getMovementIcon(type) {
  switch (type) {
    case "add":
      return "add";
    case "remove":
      return "remove";
    case "visit":
      return "visit";
    case "profile":
    default:
      return "profile";
  }
}

function formatDate(timestamp) {
  if (!timestamp || !timestamp.toDate) return "Fecha pendiente";

  const date = timestamp.toDate();

  return `• ${date.toLocaleDateString("es-MX")} ${date.toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit"
  })}`;
}

function formatPointsChange(pointsChange) {
  if (!pointsChange) return "";

  const sign = pointsChange > 0 ? "+" : "";
  return ` • Cambio: ${sign}${pointsChange} pts`;
}

function showProfileMessage(message, type) {
  profileMessage.textContent = message;
  profileMessage.className = "form-message";
  profileMessage.classList.add(type);
}

function clearProfileMessage() {
  profileMessage.textContent = "";
  profileMessage.className = "form-message";
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}