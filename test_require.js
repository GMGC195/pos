try {
  require('./server/routes/tables');
  console.log("Require successful!");
} catch (e) {
  console.error("Require failed:", e);
}
