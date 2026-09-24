

export const IMGBB_API_KEY = "cd2c1f43ac70cad4bfb4c8ff4e983611";

/* =========================================================================
   IMGBB ENDPOINT
   ========================================================================= */

export const IMGBB_UPLOAD_URL = "https://api.imgbb.com/1/upload";


/* =========================================================================
   HELPERS
   ========================================================================= */

/**
 * Upload a single File to ImgBB and return the public image URL.
 *
 * @param {File} file - The image file from an <input type="file">.
 * @returns {Promise<string>} - The public URL of the uploaded image.
 */
export async function uploadImageToImgBB(file) {

    if (!(file instanceof File) || !file.size) {
        throw new Error("No file provided for upload.");
    }

    if (!file.type.startsWith("image/")) {
        throw new Error("File must be an image.");
    }

    /*
     * ImgBB expects the image as a base64 string (no data URI prefix).
     */
    const base64 = await fileToBase64(file);

    const formData = new FormData();

    formData.append("key", IMGBB_API_KEY);
    formData.append("image", base64);
    formData.append("name", file.name || "upload");


    const response = await fetch(IMGBB_UPLOAD_URL, {
        method: "POST",
        body: formData
    });


    if (!response.ok) {
        throw new Error(
            `ImgBB upload failed: HTTP ${response.status}`
        );
    }


    const json = await response.json();


    if (!json || !json.success || !json.data?.url) {
        const reason = json?.error?.message || "unknown error";
        throw new Error(`ImgBB upload failed: ${reason}`);
    }


    return json.data.url;
}


/**
 * Convert a File to a base64 string (no prefix).
 *
 * @param {File} file
 * @returns {Promise<string>}
 */
function fileToBase64(file) {

    return new Promise((resolve, reject) => {

        const reader = new FileReader();

        reader.readAsDataURL(file);

        reader.onload = () => {

            const result = String(reader.result);
            const comma = result.indexOf(",");

            resolve(comma >= 0 ? result.slice(comma + 1) : result);
        };

        reader.onerror = (error) => reject(error);
    });
}
