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


/* =========================================================================
   FRIENDLY FIREBASE ERROR MESSAGES
   ========================================================================= */

export function getFriendlyAuthError(error) {

    const code = error?.code || "";

    switch (code) {

        case "auth/invalid-email":
            return "That email address is not valid. Please check and try again.";

        case "auth/user-disabled":
            return "This account has been disabled. Contact an administrator.";

        case "auth/user-not-found":
            return "No account exists with that email. Did you register?";

        case "auth/wrong-password":
        case "auth/invalid-credential":
            return "Incorrect email or password. Please try again.";

        case "auth/email-already-in-use":
            return "That email is already registered. Try signing in instead.";

        case "auth/weak-password":
            return "Your password is too weak. Use at least 6 characters.";

        case "auth/too-many-requests":
            return "Too many attempts. Please wait a few minutes and try again.";

        case "auth/network-request-failed":
            return "Network error. Check your internet connection and try again.";

        case "auth/operation-not-allowed":
            return "Sign-in is temporarily disabled. Please try again later.";

        case "auth/unauthorized-domain":
            return "This site is not authorized for sign-in. Contact an administrator.";

        case "auth/requests-from-referer-are-blocked":
        case "auth/requests-from-referer-empty-are-blocked":
            return "Sign-in is blocked on this domain. Contact an administrator.";

        case "auth/popup-closed-by-user":
            return "Sign-in was cancelled.";

        case "auth/popup-blocked":
            return "Your browser blocked the sign-in popup. Allow popups and try again.";

        default:
            return (
                error?.message ||
                "Sign-in failed. Please try again."
            );
    }
}


/* =========================================================================
   REGISTER USER
   ========================================================================= */

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


/* =========================================================================
   LOGIN USER
   ========================================================================= */

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


/* =========================================================================
   RESET PASSWORD
   ========================================================================= */

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


/* =========================================================================
   LOGOUT USER
   ========================================================================= */

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
