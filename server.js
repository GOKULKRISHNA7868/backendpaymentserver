const express = require("express");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const qs = require("querystring");
const cors = require("cors");

const app = express();

/* ===============================
   CONFIG
   =============================== */

const merchant_id = "4423673";
const access_code = "AVJW88NB21AL14WJLA";
const working_key = "4CE2CC6602914AD1FA96DF7457299700";
const CCAV_ENV = "PROD";

/* ===============================
   DOMAINS
   =============================== */

const FRONTEND_DOMAIN = "https://kridana.net"; 
const BACKEND_DOMAIN = "https://backendpaymentserver.onrender.com";

/* ===============================
   MIDDLEWARE
   =============================== */

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

/* ===============================
   ENCRYPT / DECRYPT
   =============================== */

function md5(data) {
  return crypto.createHash("md5").update(data).digest();
}

function encrypt(text, workingKey) {
  const key = md5(workingKey);
  const iv = Buffer.from([
    0x00,0x01,0x02,0x03,0x04,0x05,0x06,0x07,
    0x08,0x09,0x0a,0x0b,0x0c,0x0d,0x0e,0x0f
  ]);
  const cipher = crypto.createCipheriv("aes-128-cbc", key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return encrypted;
}

function decrypt(encText, workingKey) {
  const key = md5(workingKey);
  const iv = Buffer.from([
    0x00,0x01,0x02,0x03,0x04,0x05,0x06,0x07,
    0x08,0x09,0x0a,0x0b,0x0c,0x0d,0x0e,0x0f
  ]);
  const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);
  let decrypted = decipher.update(encText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/* ===============================
   CREATE ORDER
   =============================== */

app.post("/api/create-order", (req, res) => {
  const order_id = "ORD" + Date.now();

  const redirect_url = `${BACKEND_DOMAIN}/api/payment-response`;
  const cancel_url = `${BACKEND_DOMAIN}/api/payment-cancel`;

  const dataObj = {
    merchant_id,
    order_id,
    currency: "INR",
    amount: "1.00",
    redirect_url,
    cancel_url,
    billing_name: "Test User",
    billing_email: "test@kridana.net",
    billing_tel: "9999999999",
  };

  const data = qs.stringify(dataObj);
  const encRequest = encrypt(data, working_key);

  const paymentUrl =
    CCAV_ENV === "PROD"
      ? "https://secure.ccavenue.com/transaction/transaction.do?command=initiateTransaction"
      : "https://test.ccavenue.com/transaction/transaction.do?command=initiateTransaction";

  res.json({
    url: paymentUrl,
    encRequest,
    access_code,
    order_id,
  });
});

/* ===============================
   PAYMENT RESPONSE (FROM CCAVENUE)
   =============================== */

app.post("/api/payment-response", (req, res) => {
  const encResp = req.body.encResp;

  if (!encResp) {
    return res.status(400).send("Invalid CCAvenue Response");
  }

  try {
    const decrypted = decrypt(encResp, working_key);
    const parsed = qs.parse(decrypted);

    console.log("CCAvenue Response:", parsed);

    /* ===============================
       REDIRECT TO FRONTEND
       =============================== */

    const redirectUrl = `${FRONTEND_DOMAIN}/paymentsuccesspage?${qs.stringify(parsed)}`;

    return res.redirect(302, redirectUrl);

  } catch (err) {
    console.error("Decrypt error:", err);
    return res.status(500).send("Decrypt Failed");
  }
});

/* ===============================
   PAYMENT CANCEL
   =============================== */

app.post("/api/payment-cancel", (req, res) => {
  return res.redirect(`${FRONTEND_DOMAIN}/paymentfailed`);
});

/* ===============================
   HEALTH
   =============================== */

app.get("/", (req, res) => {
  res.send("Payment Server Running ✅");
});

/* ===============================
   START SERVER
   =============================== */

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
