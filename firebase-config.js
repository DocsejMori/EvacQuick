/* =========================================================================
   firebase-config.js
   -------------------------------------------------------------------------
   Single Firebase initialization for EvacQuick.

   Exports:
     - app : Firebase app instance
     - db  : Cloud Firestore instance

   Also re-exports all Firestore helper functions used elsewhere in the app.
   ========================================================================= */

import { initializeApp }
    from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";

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
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";


/* =========================================================================
   CONFIG
   ========================================================================= */

const firebaseConfig = {
    apiKey: "AIzaSyBYdWgwnTrD-6PQWaAotbho9KBvFLw_a-c",
    authDomain: "evacquick.firebaseapp.com",
    projectId: "evacquick",
    storageBucket: "evacquick.firebasestorage.app",
    messagingSenderId: "69947115795",
    appId: "1:69947115795:web:2a5641553be52cb9ce72e6"
};


/* =========================================================================
   INITIALIZE
   ========================================================================= */

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);


/* =========================================================================
   EXPORTS
   ========================================================================= */

export { app, db };

export {
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
    serverTimestamp
};
