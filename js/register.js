import { auth, db } from "../firebase/firebase-config.js";
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc,
  setDoc,
  serverTimestamp,
  collection,
  addDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const registerForm = document.getElementById("registerForm");
const registerMessage = document.getElementById("registerMessage");

registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const firstName = document.getElementById("firstName").value.trim();
  const lastName = document.getElementById("lastName").value.trim();
  const email = document.getElementById("email").value.trim();
  const phone = document.getElementById("phone").value.trim();
  const birthday = document.getElementById("birthday").value;
  const city = document.getElementById("city").value.trim();
  const password = document.getElementById("password").value.trim();
  const confirmPassword = document.getElementById("confirmPassword").value.trim();
  const terms = document.getElementById("terms").checked;

  registerMessage.textContent = "";
  registerMessage.className = "form-message";

  if (!firstName || !lastName || !email || !phone || !birthday || !password || !confirmPassword) {
    showMessage("Completa todos los campos obligatorios.", "error");
    return;
  }

  if (password.length < 6) {
    showMessage("La contraseña debe tener al menos 6 caracteres.", "error");
    return;
  }

  if (password !== confirmPassword) {
    showMessage("Las contraseñas no coinciden.", "error");
    return;
  }

  if (!terms) {
    showMessage("Debes aceptar los términos y condiciones.", "error");
    return;
  }

  try {
    showMessage("Creando cuenta...", "success");

    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    const walletId = `AB-${user.uid.substring(0, 6).toUpperCase()}`;

    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid,
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`,
      email,
      phone,
      birthday,
      city,
      points: 0,
      visits: 0,
      level: "Classic",
      walletId,
      qrCode: "",
      role: "customer",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    await addDoc(collection(db, "users", user.uid, "movements"), {
      type: "profile",
      title: "Cuenta creada",
      description: "Tu cuenta de Applebee’s Rewards fue creada correctamente.",
      pointsChange: 0,
      createdAt: serverTimestamp()
    });

    showMessage("Cuenta creada correctamente. Redirigiendo...", "success");

    setTimeout(() => {
      window.location.href = "panel.html";
    }, 1200);

  } catch (error) {
    console.error("Error al registrar:", error);

    switch (error.code) {
      case "auth/email-already-in-use":
        showMessage("Este correo ya está registrado.", "error");
        break;
      case "auth/invalid-email":
        showMessage("El correo no es válido.", "error");
        break;
      case "auth/weak-password":
        showMessage("La contraseña es demasiado débil.", "error");
        break;
      default:
        showMessage("Ocurrió un error al crear la cuenta.", "error");
        break;
    }
  }
});

function showMessage(message, type) {
  registerMessage.textContent = message;
  registerMessage.className = "form-message";
  registerMessage.classList.add(type);
}