/* =========================================================================
   firebase-config.js
   ========================================================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";

import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    collection,
    addDoc,
    getDocs,
    query,
    where,
    serverTimestamp,
    onSnapshot,
    writeBatch,
    limit,       // <-- ADD THIS
    orderBy      // <-- ADD THIS
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBYdWgwnTrD-6PQWaAotbho9KBvFLw_a-c",
    authDomain: "evacquick.firebaseapp.com",
    projectId: "evacquick",
    storageBucket: "evacquick.firebasestorage.app",
    messagingSenderId: "69947115795",
    appId: "1:69947115795:web:2a5641553be52cb9ce72e6"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

export { app, db };

export {
    doc, getDoc, setDoc, updateDoc, deleteDoc, collection, addDoc, getDocs, query, where, serverTimestamp, onSnapshot, writeBatch, limit, orderBy
};