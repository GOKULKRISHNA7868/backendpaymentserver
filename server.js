const express = require("express");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const qs = require("querystring");
const cors = require("cors");

const app = express();

/* ================= MIDDLEWARE ================= */
app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

/* ================= CCAvenue CONFIG ================= */

const merchant_id = "4423673";
const access_code = "AVJW88NB21AL14WJLA";
const working_key = "4CE2CC6602914AD1FA96DF7457299700";
const CCAV_ENV = "PROD"; // or "TEST"

const CCAVENUE_URL =
  CCAV_ENV === "PROD"
    ? "https://secure.ccavenue.com/transaction/transaction.do?command=initiateTransaction"
    : "https://test.ccavenue.com/transaction/transaction.do?command=initiateTransaction";

/* ================= IN-MEMORY STORE ================= */
/* ⚠️ Replace with DB/Redis in production */
global.paymentStore = global.paymentStore || {};

/* ================= ENCRYPTION ================= */
/* CCAvenue Standard AES-128-ECB */

function encrypt(data, key) {
  const m = crypto.createHash("md5");
  m.update(key);
  const keyHash = m.digest("binary");

  const cipher = crypto.createCipheriv("aes-128-ecb", keyHash, "");
  let encrypted = cipher.update(data, "utf8", "hex");
  encrypted += cipher.final("hex");
  return encrypted;
}

function decrypt(encData, key) {
  const m = crypto.createHash("md5");
  m.update(key);
  const keyHash = m.digest("binary");

  const decipher = crypto.createDecipheriv("aes-128-ecb", keyHash, "");
  let decrypted = decipher.update(encData, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/* ================= HEALTH ================= */
app.get("/", (req, res) => {
  res.send("Kridana Payment Server Running 🚀");
});

/* ================= INITIATE PAYMENT ================= */
/* Called from frontend */
app.post("/api/payment/initiate", (req, res) => {
  try {
    const { amount, order_id, customer } = req.body;

    const redirect_url = "https://backendpaymentserver.onrender.com/api/payment/response";
    const cancel_url = "https://backendpaymentserver.onrender.com/api/payment/cancel";

    const dataObj = {
      merchant_id,
      order_id,
      amount,
      currency: "INR",
      redirect_url,
      cancel_url,
      language: "EN",
      billing_name: customer.name,
      billing_email: customer.email,
      billing_tel: customer.phone,
    };

    // URL encoded string
    const data = qs.stringify(dataObj);

    const encRequest = encrypt(data, working_key);

    // Save pending state
    global.paymentStore[order_id] = {
      status: "PENDING",
      createdAt: Date.now(),
      amount,
      customer,
    };

    res.json({
      url: CCAVENUE_URL,
      encRequest,
      access_code,
      order_id,
    });
  } catch (err) {
    console.error("Initiate Error:", err);
    res.status(500).json({ success: false, error: "Payment initiation failed" });
  }
});

/* ================= CCAvenue RESPONSE ================= */
/* Called by CCAvenue gateway */
app.post("/api/payment/response", (req, res) => {
  try {
    const encResp = req.body.encResp;

    if (!encResp) {
      return res.redirect("https://kridana.net/paymentfailed");
    }

    const decrypted = decrypt(encResp, working_key);
    console.log("CCAvenue Decrypted Response:", decrypted);

    const parsed = qs.parse(decrypted);

    /*
      parsed.order_status
      parsed.order_id
      parsed.tracking_id
      parsed.payment_mode
      parsed.amount
      parsed.bank_ref_no
    */

    if (parsed.order_status === "Success") {
      global.paymentStore[parsed.order_id] = {
        status: "PAID",
        paymentId: parsed.tracking_id,
        amount: parsed.amount,
        raw: parsed,
        verifiedAt: Date.now(),
      };

      // ✅ REDIRECT USER TO FRONTEND SUCCESS PAGE
      const query = new URLSearchParams(parsed).toString();
      return res.redirect(`https://kridana.net/paymentsuccesspage?${query}`);
    } else {
      global.paymentStore[parsed.order_id] = {
        status: "FAILED",
        raw: parsed,
        verifiedAt: Date.now(),
      };

      // ❌ REDIRECT TO FAILED PAGE
      return res.redirect("https://kridana.net/paymentfailed");
    }
  } catch (err) {
    console.error("Decrypt Error:", err);
    return res.redirect("https://kridana.net/paymentfailed");
  }
});

/* ================= VERIFY PAYMENT ================= */
/* API for frontend polling */
app.get("/api/payment/verify/:orderId", (req, res) => {
  const { orderId } = req.params;

  const payment = global.paymentStore[orderId];

  if (!payment) {
    return res.json({
      success: false,
      status: "PENDING",
    });
  }

  if (payment.status === "PAID") {
    return res.json({
      success: true,
      status: "PAID",
      paymentId: payment.paymentId,
      amount: payment.amount,
    });
  }

  if (payment.status === "FAILED") {
    return res.json({
      success: false,
      status: "FAILED",
    });
  }

  return res.json({
    success: false,
    status: "UNKNOWN",
  });
});

/* ================= CANCEL ================= */
app.post("/api/payment/cancel", (req, res) => {
  return res.redirect("https://kridana.net/paymentcancelled");
});

/* ================= SERVER ================= */

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Kridana Payment Server running on port ${PORT}`);
});
