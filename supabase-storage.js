/* =========================================================================
   SUPABASE STORAGE  (replaces filebase-config.js)
   ========================================================================= */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://exilogbjwmemiaskybsy.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_pWrKpCnQElV11ctnybZkOQ_oAAD-ba1";

const BUCKET_NAME = "facility-photos";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

/**
 * Upload a File to Supabase Storage and return the public URL.
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function uploadImageToSupabase(file) {

    if (!(file instanceof File) || !file.size) {
        throw new Error("No file provided for upload.");
    }

    if (!file.type.startsWith("image/")) {
        throw new Error("File must be an image.");
    }

    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const filePath = `uploads/${unique}.${ext}`;

    const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, file, {
            cacheControl: "3600",
            contentType: file.type,
            upsert: false,
        });

    if (uploadError) {
        throw new Error(`Supabase upload failed: ${uploadError.message}`);
    }

    const { data } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(filePath);

    if (!data || !data.publicUrl) {
        throw new Error("Supabase upload succeeded but no public URL returned.");
    }

    return data.publicUrl;
}
