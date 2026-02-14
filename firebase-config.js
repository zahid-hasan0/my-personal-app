import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCKeOU_kwe3gfNQw2v49pff_NQMjt5WvtE",
    authDomain: "purches-form.firebaseapp.com",
    projectId: "purches-form",
    storageBucket: "purches-form.firebasestorage.app",
    messagingSenderId: "162081115542",
    appId: "1:162081115542:web:f612688483afb5a7aa21b7"
};

const fbApp = initializeApp(firebaseConfig);
export const auth = getAuth(fbApp);
export const db = getFirestore(fbApp);
