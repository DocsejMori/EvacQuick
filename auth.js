import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    signOut
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

import { app } from "./firebase-config.js";


// Initialize Firebase Authentication
const auth = getAuth(app);


// ============================
// REGISTER USER
// ============================

export async function registerUser(email, password) {

    try {

        const userCredential =
            await createUserWithEmailAndPassword(
                auth,
                email,
                password
            );

        return {
            success: true,
            user: userCredential.user
        };

    } catch (error) {

        return {
            success: false,
            error: error
        };

    }
}


// ============================
// LOGIN USER
// ============================

export async function loginUser(email, password) {

    try {

        const userCredential =
            await signInWithEmailAndPassword(
                auth,
                email,
                password
            );

        return {
            success: true,
            user: userCredential.user
        };

    } catch (error) {

        return {
            success: false,
            error: error
        };

    }
}


// ============================
// RESET PASSWORD
// ============================

export async function resetPassword(email) {

    try {

        await sendPasswordResetEmail(
            auth,
            email
        );

        return {
            success: true
        };

    } catch (error) {

        return {
            success: false,
            error: error
        };

    }
}


// ============================
// LOGOUT USER
// ============================

export async function logoutUser() {

    try {

        await signOut(auth);

        return {
            success: true
        };

    } catch (error) {

        return {
            success: false,
            error: error
        };

    }
}


// Export Firebase Auth
export { auth };
