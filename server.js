import express from "express";
import bodyParser from "body-parser";
import crypto from "crypto";
import cors from "cors";

const app = express();

/* ================= MIDDLEWARE ================= */
app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

/* ================= CONFIG ================= */
const merchant_id = "4423673";
const access_code = "AVJW88NB21AL14WJLA";
const working_key = "4CE2CC6602914AD1FA96DF7457299700";
const CCAV_ENV = "PROD";

const CCAVENUE_URL =
  "https://secure.ccavenue.com/transaction/transaction.do?command=initiateTransaction";

/* ================= ENCRYPTION ================= */
/* CCAvenue uses AES-128-ECB (NO IV, NO CBC) */

function encrypt(data, key) {
  const cipher = crypto.createCipheriv(
    "aes-128-ecb",
    Buffer.from(key.substring(0, 16)),
    null
  );
  cipher.setAutoPadding(true);
  let encrypted = cipher.update(data, "utf8", "hex");
  encrypted += cipher.final("hex");
  return encrypted;
}

function decrypt(encData, key) {
  const decipher = crypto.createDecipheriv(
    "aes-128-ecb",
    Buffer.from(key.substring(0, 16)),
    null
  );
  decipher.setAutoPadding(true);
  let decrypted = decipher.update(encData, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/* ================= ROUTES ================= */

/* HEALTH CHECK */
app.get("/", (req, res) => {
  res.send("Kridana CCAvenue Backend Running 🚀");
});

/* CREATE ORDER */
app.post("/api/create-order", async (req, res) => {
  try {
    const order_id = "ORD_" + Date.now();

    /* STRICT FORMAT REQUIRED BY CCAVENUE */
    const merchantData =
      `merchant_id=${merchant_id}` +
      `&order_id=${order_id}` +
      `&currency=INR` +
      `&amount=1.00` + // ₹1 test
      `&redirect_url=https://backendpaymentserver.onrender.com/api/ccavenue-response` +
      `&cancel_url=https://backendpaymentserver.onrender.com/api/ccavenue-response` +
      `&language=EN` +
      `&billing_name=Test User` +
      `&billing_email=test@kridana.net` +
      `&billing_tel=9999999999`;

    const encryptedData = encrypt(merchantData, working_key);

    res.json({
      encRequest: encryptedData,
      access_code: access_code,
      ccavenue_url: CCAVENUE_URL,
    });
  } catch (error) {
    console.error("Create Order Error:", error);
    res.status(500).json({ error: "Order creation failed" });
  }
});

/* CCAvenue RESPONSE HANDLER */
app.post("/api/ccavenue-response", (req, res) => {
  try {
    const encResp = req.body.encResp;

    if (!encResp) {
      console.error("No encResp received");
      return res.redirect("https://kridana.net/paymentfailed");
    }

    const decrypted = decrypt(encResp, working_key);

    /* Convert query string to object */
    const responseData = {};
    decrypted.split("&").forEach((pair) => {
      const [key, value] = pair.split("=");
      responseData[key] = value;
    });

    console.log("CCAvenue Response:", responseData);

    /* Redirect to frontend success page with params */
    const query = new URLSearchParams(responseData).toString();

    res.redirect(`https://kridana.net/paymentsuccesspage?${query}`);
  } catch (error) {
    console.error("Decrypt Error:", error);
    res.redirect("https://kridana.net/paymentfailed");
  }
});

/* ================= SERVER ================= */

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`CCAvenue Backend Running on port ${PORT}`);
});
