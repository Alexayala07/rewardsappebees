import { auth } from "../firebase/firebase-config.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");
const passwordInput = document.getElementById("password");
const togglePassword = document.getElementById("togglePassword");

togglePassword.addEventListener("click", () => {
  const isPassword = passwordInput.type === "password";
  passwordInput.type = isPassword ? "text" : "password";
  togglePassword.textContent = isPassword ? "Ocultar" : "Ver";
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = passwordInput.value.trim();

  loginMessage.textContent = "";
  loginMessage.className = "form-message";

  if (!email || !password) {
    showMessage("Por favor completa todos los campos.", "error");
    return;
  }

  try {
    showMessage("Validando acceso...", "success");

    await signInWithEmailAndPassword(auth, email, password);

    showMessage("Acceso correcto. Entrando al panel...", "success");

    setTimeout(() => {
      window.location.href = "panel.html";
    }, 1000);

  } catch (error) {
    console.error("Error al iniciar sesión:", error);

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
        showMessage("No fue posible iniciar sesión.", "error");
        break;
    }
  }
});

function showMessage(message, type) {
  loginMessage.textContent = message;
  loginMessage.className = "form-message";
  loginMessage.classList.add(type);
}