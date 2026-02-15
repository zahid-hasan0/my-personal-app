import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import {
    getAuth,
    setPersistence,
    browserLocalPersistence,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    signOut,
    onAuthStateChanged,
    updateProfile,
    GoogleAuthProvider,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyBBQIEDyziVjGJgPte5M4Tr1Yz5FWhRaas",
    authDomain: "my-personal-app-5c7f1.firebaseapp.com",
    projectId: "my-personal-app-5c7f1",
    storageBucket: "my-personal-app-5c7f1.firebasestorage.app",
    messagingSenderId: "431743980626",
    appId: "1:431743980626:web:93dbcf45df3dd5172bbb8b",
    measurementId: "G-S9TCDDHPQ8"
};

const fbApp = initializeApp(firebaseConfig);
export const db = getFirestore(fbApp);
export const auth = getAuth(fbApp);
setPersistence(auth, browserLocalPersistence);
export const googleProvider = new GoogleAuthProvider();
export { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile, signInWithPopup, signInWithRedirect, getRedirectResult, sendPasswordResetEmail };
