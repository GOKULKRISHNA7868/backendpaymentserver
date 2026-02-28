import express from "express";
import bodyParser from "body-parser";
import crypto from "crypto";
import cors from "cors";
import axios from "axios";

const app = express();
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

/* ============ ENCRYPT / DECRYPT ============ */

function encrypt(data, key) {
  const cipher = crypto.createCipheriv(
    "aes-128-cbc",
    Buffer.from(key.substring(0, 16)),
    Buffer.from(key.substring(0, 16)),
  );
  let encrypted = cipher.update(data, "utf8", "hex");
  encrypted += cipher.final("hex");
  return encrypted;
}

function decrypt(encData, key) {
  const decipher = crypto.createDecipheriv(
    "aes-128-cbc",
    Buffer.from(key.substring(0, 16)),
    Buffer.from(key.substring(0, 16)),
  );
  let decrypted = decipher.update(encData, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/* ================== ROUTES ================== */

/* CREATE ORDER */
app.post("/api/create-order", async (req, res) => {
  try {
    const order_id = "ORD_" + Date.now();

    const data = {
      merchant_id,
      order_id,
      currency: "INR",
      amount: "1.00", // ₹1 test
      redirect_url: "https://kridana.net/paymentsuccesspage",
      cancel_url: "https://kridana.net/paymentfailed",
      language: "EN",
      billing_name: "Test User",
      billing_email: "test@kridana.net",
      billing_tel: "9999999999",
    };

    let merchantData = "";
    for (let key in data) {
      merchantData += `${key}=${data[key]}&`;
    }

    const encryptedData = encrypt(merchantData, working_key);

    res.json({
      encRequest: encryptedData,
      access_code,
      ccavenue_url: CCAVENUE_URL,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Order creation failed" });
  }
});

/* PAYMENT RESPONSE HANDLER */
app.post("/api/ccavenue-response", (req, res) => {
  try {
    const encResp = req.body.encResp;
    const decrypted = decrypt(encResp, working_key);

    // Convert querystring → object
    const responseData = {};
    decrypted.split("&").forEach((pair) => {
      const [key, value] = pair.split("=");
      responseData[key] = value;
    });

    // Redirect to frontend success page
    const query = new URLSearchParams(responseData).toString();
    res.redirect(`https://kridana.net/paymentsuccesspage?${query}`);
  } catch (err) {
    console.error(err);
    res.redirect("https://kridana.net/paymentfailed");
  }
});

app.listen(5000, () => {
  console.log("CCAvenue Server running on port 5000");
});
