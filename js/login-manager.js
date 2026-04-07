import { auth, db } from "../firebase/firebase-config.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const form = document.getElementById("managerLoginForm");
const emailInput = document.getElementById("managerEmail");
const passwordInput = document.getElementById("managerPassword");
const togglePassword = document.getElementById("toggleManagerPassword");
const messageBox = document.getElementById("managerLoginMessage");

togglePassword.addEventListener("click", () => {
  const isPassword = passwordInput.type === "password";
  passwordInput.type = isPassword ? "text" : "password";
  togglePassword.textContent = isPassword ? "Ocultar" : "Ver";
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();

  clearMessage();

  if (!email || !password) {
    showMessage("Completa correo y contraseña.", "error");
    return;
  }

  try {
    showMessage("Validando acceso...", "success");

    const credential = await signInWithEmailAndPassword(auth, email, password);
    const user = credential.user;

    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      showMessage("Tu cuenta no tiene perfil válido.", "error");
      return;
    }

    const data = userSnap.data();
    const role = data.role || "customer";

    if (role !== "manager" && role !== "admin") {
      showMessage("Tu cuenta no tiene permisos de gerente.", "error");
      return;
    }

    showMessage("Acceso autorizado. Entrando al panel...", "success");

    setTimeout(() => {
      window.location.href = "manager.html";
    }, 900);

  } catch (error) {
    console.error("Error login gerente:", error);

    switch (error.code) {
      case "auth/invalid-credential":
      case "auth/wrong-password":
      case "auth/user-not-found":
        showMessage("Correo o contraseña incorrectos.", "error");
        break;
      case "auth/invalid-email":
        showMessage("El correo no es válido.", "error");
        break;
      case "auth/too-many-requests":
        showMessage("Demasiados intentos. Intenta más tarde.", "error");
        break;
      default:
        showMessage("No se pudo iniciar sesión.", "error");
        break;
    }
  }
});

function showMessage(text, type) {
  messageBox.textContent = text;
  messageBox.className = "message";
  messageBox.classList.add(type);
}

function clearMessage() {
  messageBox.textContent = "";
  messageBox.className = "message";
}