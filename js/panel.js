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
let spinCountdownInterval = null;
let currentWheelRotation = 0;

const prizes = [
  { label: "$0.00", value: 0, weight: 40, type: "spin" },
  { label: "$1.00", value: 1, weight: 30, type: "spin" },
  { label: "$5.00", value: 5, weight: 15, type: "spin" },
  { label: "Otra oportunidad", value: "retry", weight: 10, type: "retry" },
  { label: "$30.00", value: 30, weight: 4, type: "spin" },
  { label: "$50.00", value: 50, weight: 1, type: "spin" }
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
    const fullName =
      currentUserData.fullName ||
      `${firstName} ${lastName}`.trim() ||
      "Usuario Applebee’s";

    const email = currentUserData.email || currentUser.email || "-";
    const phone = currentUserData.phone || "";
    const city = currentUserData.city || "";
    const birthday = currentUserData.birthday || "";
    const balance = Number(currentUserData.balance ?? currentUserData.points ?? 0);
    const visits = currentUserData.visits ?? 0;
    const level = currentUserData.level || "Classic";
    const digitalId =
      currentUserData.walletId && currentUserData.walletId.trim() !== ""
        ? currentUserData.walletId
        : generateWalletId(currentUser.uid);

    userName.textContent = firstName || "Usuario";
    walletFullName.textContent = fullName;
    userPoints.textContent = formatMoney(balance);
    userVisits.textContent = visits;
    userLevel.textContent = level;
    walletId.textContent = digitalId;

    summaryPoints.textContent = formatMoney(balance);
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

profileForm?.addEventListener("submit", async (e) => {
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

    await addMovement(
      "profile",
      "Perfil actualizado",
      "Tus datos personales fueron actualizados."
    );

    showProfileMessage("Perfil actualizado correctamente.", "success");
    await loadUserProfile();
    await loadMovements();
  } catch (error) {
    console.error("Error actualizando perfil:", error);
    showProfileMessage("No se pudo actualizar el perfil.", "error");
  }
});

logoutBtn?.addEventListener("click", async () => {
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
      resultText.textContent = `Vuelve a jugar en ${canSpin.remainingClock}.`;
      return;
    }

    spinBtn.disabled = true;
    resultText.textContent = "Girando...";

    const prizeIndex = getWeightedPrizeIndex();
    const prize = prizes[prizeIndex];

    const segmentAngle = 360 / prizes.length;
    const pointerAngle = 0;
    const segmentCenter = (prizeIndex * segmentAngle) + (segmentAngle / 2);

    const fullSpins = 360 * 6;
    const finalAngle = fullSpins + (360 - segmentCenter + pointerAngle);

    currentWheelRotation += finalAngle;
    wheel.style.transform = `rotate(${currentWheelRotation}deg)`;

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

          resultText.textContent = "¡Otra oportunidad! Vuelve a jugar en 24:00:00.";
        } else {
          const prizeBalance = Number(prize.value) || 0;
          const currentBalance = Number(currentUserData.balance ?? currentUserData.points ?? 0);
          const currentVisits = currentUserData.visits ?? 0;
          const newBalance = Number((currentBalance + prizeBalance).toFixed(2));
          const newLevel = calculateLevel(newBalance, currentVisits);

          await updateDoc(userRef, {
            balance: newBalance,
            points: newBalance, // compatibilidad temporal
            level: newLevel,
            lastSpinAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });

          await addMovement(
            "spin",
            "Premio de ruleta",
            `Ganaste ${prize.label} de dinero electrónico en la ruleta promocional.`,
            prizeBalance
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
    }, 4500);
  });
}

async function addMovement(type, title, description, balanceChange = 0) {
  if (!currentUser) return;

  try {
    const movementsRef = collection(db, "users", currentUser.uid, "movements");

    await addDoc(movementsRef, {
      type,
      title,
      description,
      balanceChange,
      pointsChange: balanceChange, // compatibilidad temporal
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
      const amountChange = data.balanceChange ?? data.pointsChange ?? 0;

      const item = document.createElement("div");
      item.className = "activity-item";
      item.innerHTML = `
        <div class="activity-icon ${iconClass}"></div>
        <div>
          <strong>${escapeHtml(data.title || "Movimiento")}</strong>
          <p>${escapeHtml(data.description || "")}</p>
          <p>${dateText}${formatBalanceChange(amountChange)}</p>
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

function getWeightedPrizeIndex() {
  const totalWeight = prizes.reduce((sum, p) => sum + p.weight, 0);
  let random = Math.random() * totalWeight;

  for (let i = 0; i < prizes.length; i++) {
    if (random < prizes[i].weight) {
      return i;
    }
    random -= prizes[i].weight;
  }

  return 0;
}

function canUserSpin() {
  const lastSpin = currentUserData?.lastSpinAt;

  if (!lastSpin || !lastSpin.toDate) {
    return {
      allowed: true,
      remainingMs: 0,
      remainingClock: "00:00:00"
    };
  }

  const lastSpinDate = lastSpin.toDate();
  const now = new Date();
  const diffMs = now.getTime() - lastSpinDate.getTime();
  const hours24 = 24 * 60 * 60 * 1000;

  if (diffMs >= hours24) {
    return {
      allowed: true,
      remainingMs: 0,
      remainingClock: "00:00:00"
    };
  }

  const remainingMs = hours24 - diffMs;

  return {
    allowed: false,
    remainingMs,
    remainingClock: formatCountdown(remainingMs)
  };
}

function updateSpinAvailabilityUI() {
  if (!spinBtn || !resultText) return;

  if (spinCountdownInterval) {
    clearInterval(spinCountdownInterval);
    spinCountdownInterval = null;
  }

  const updateView = () => {
    const spinState = canUserSpin();

    if (spinState.allowed) {
      spinBtn.disabled = false;
      resultText.textContent = "Puedes girar ahora.";
      return;
    }

    spinBtn.disabled = true;
    resultText.textContent = `Vuelve a jugar en ${spinState.remainingClock}.`;
  };

  updateView();

  spinCountdownInterval = setInterval(() => {
    const spinState = canUserSpin();

    if (spinState.allowed) {
      clearInterval(spinCountdownInterval);
      spinCountdownInterval = null;
      spinBtn.disabled = false;
      resultText.textContent = "Puedes girar ahora.";
      return;
    }

    resultText.textContent = `Vuelve a jugar en ${spinState.remainingClock}.`;
  }, 1000);
}

function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");

  return `${hours}:${minutes}:${seconds}`;
}

function generateWalletId(uid) {
  return `AB-${uid.substring(0, 6).toUpperCase()}`;
}

function calculateLevel(balance, visits) {
  if (balance >= 200 || visits >= 15) return "Gold";
  if (balance >= 100 || visits >= 8) return "Silver";
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

function formatBalanceChange(value) {
  if (!value) return "";

  const numeric = Number(value || 0);
  const sign = numeric > 0 ? "+" : "";
  return ` • Cambio: ${sign}${formatMoney(numeric)}`;
}

function formatMoney(value) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN"
  }).format(Number(value || 0));
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