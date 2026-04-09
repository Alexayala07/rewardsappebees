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
const activityList = document.getElementById("activityList");

const spinBtn = document.getElementById("spinBtn");
const wheel = document.getElementById("wheel");
const resultText = document.getElementById("wheelResult");

let currentUser = null;
let currentUserData = null;

const prizes = [
  { label: "0 puntos", value: 0, weight: 40, type: "spin" },
  { label: "1 punto", value: 1, weight: 30, type: "spin" },
  { label: "5 puntos", value: 5, weight: 15, type: "spin" },
  { label: "Otra oportunidad", value: "retry", weight: 10, type: "retry" },
  { label: "30 puntos", value: 30, weight: 4, type: "spin" },
  { label: "50 puntos", value: 50, weight: 1, type: "spin" }
];

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUser = user;
  await loadUserProfile();
  await loadMovements();
  updateSpinAvailabilityUI();
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

logoutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
    window.location.href = "index.html";
  } catch (error) {
    console.error("Error al cerrar sesión:", error);
    alert("No se pudo cerrar sesión.");
  }
});

if (spinBtn && wheel && resultText) {
  spinBtn.addEventListener("click", async () => {
    if (!currentUser || !currentUserData) return;

    const canSpin = canUserSpin();
    if (!canSpin.allowed) {
      resultText.textContent = `Podrás volver a girar en ${canSpin.remainingText}.`;
      return;
    }

    spinBtn.disabled = true;
    resultText.textContent = "Girando...";

    const prize = getWeightedPrize();
    const rotation = 3600 + Math.floor(Math.random() * 360);
    wheel.style.transform = `rotate(${rotation}deg)`;

    setTimeout(async () => {
      try {
        const userRef = doc(db, "users", currentUser.uid);

        if (prize.value === "retry") {
          await updateDoc(userRef, {
            lastSpinAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });

          await addMovement(
            "spin",
            "Ruleta jugada",
            "Obtuviste otra oportunidad en la ruleta.",
            0
          );

          resultText.textContent = "¡Otra oportunidad! Vuelve a intentar en 24 horas.";
        } else {
          const prizePoints = Number(prize.value) || 0;
          const currentPoints = currentUserData.points ?? 0;
          const currentVisits = currentUserData.visits ?? 0;
          const newPoints = currentPoints + prizePoints;
          const newLevel = calculateLevel(newPoints, currentVisits);

          await updateDoc(userRef, {
            points: increment(prizePoints),
            level: newLevel,
            lastSpinAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });

          await addMovement(
            "spin",
            "Premio de ruleta",
            `Ganaste ${prize.label} en la ruleta promocional.`,
            prizePoints
          );

          resultText.textContent = `Ganaste ${prize.label}`;
        }

        await loadUserProfile();
        await loadMovements();
        updateSpinAvailabilityUI();

      } catch (error) {
        console.error("Error procesando ruleta:", error);
        resultText.textContent = "No se pudo registrar tu premio.";
        spinBtn.disabled = false;
      }
    }, 4000);
  });
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

function getWeightedPrize() {
  const totalWeight = prizes.reduce((sum, p) => sum + p.weight, 0);
  let random = Math.random() * totalWeight;

  for (const prize of prizes) {
    if (random < prize.weight) {
      return prize;
    }
    random -= prize.weight;
  }

  return prizes[0];
}

function canUserSpin() {
  const lastSpin = currentUserData?.lastSpinAt;

  if (!lastSpin || !lastSpin.toDate) {
    return { allowed: true, remainingText: "" };
  }

  const lastSpinDate = lastSpin.toDate();
  const now = new Date();
  const diffMs = now.getTime() - lastSpinDate.getTime();
  const hours24 = 24 * 60 * 60 * 1000;

  if (diffMs >= hours24) {
    return { allowed: true, remainingText: "" };
  }

  const remainingMs = hours24 - diffMs;
  const totalMinutes = Math.ceil(remainingMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return {
    allowed: false,
    remainingText: `${hours}h ${minutes}m`
  };
}

function updateSpinAvailabilityUI() {
  if (!spinBtn || !resultText) return;

  const spinState = canUserSpin();

  if (spinState.allowed) {
    spinBtn.disabled = false;
    resultText.textContent = "Puedes girar una vez cada 24 horas.";
  } else {
    spinBtn.disabled = true;
    resultText.textContent = `Disponible nuevamente en ${spinState.remainingText}.`;
  }
}

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
    case "spin":
      return "add";
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