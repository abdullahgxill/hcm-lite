import app from "./app.js";
app.listen(process.env.PORT || 3001, () =>
  console.log(`HCM Lite API listening on port ${process.env.PORT || 3001}`),
);
