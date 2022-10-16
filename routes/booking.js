const express = require("express");
const bodyParser = require("body-parser");
const queryDB = require("../config/db");
const userMiddleware = require("../middleware/role");
const payment = require("../routes/payment");
var uuid = require("uuid");

router = express.Router();
router.use(express.json());
router.use(
  bodyParser.urlencoded({
    extended: true,
  })
);

const doInsertBooking = async (req, res) => {
  let vehicle_id = req.body.carId;
  let start_date = req.body.bookDate;
  let end_date = req.body.returnDate;
  let insurance = req.body.insuranceId;
  let amount_balance = parseInt(req.body.amountBalance, 10);
  let tax_amount = parseInt(req.body.tax_amount, 10);
  let total_amount = parseInt(req.body.total_amount, 10);
  let id_no = req.userData.id;
  var id = uuid.v4();

  if (insurance === "") {
    insurance = null;
  }

  var sql =
    "INSERT INTO booking (book_id, vehicle_id, id_no, in_id, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)";
  try {
    var result = await queryDB(sql, [
      id,
      vehicle_id,
      id_no,
      insurance,
      start_date,
      end_date,
      "current",
    ]);
    res.send(201, { message: "booked already" });
  } catch (err) {
    console.log(err);
    res.send(err, 500);
    return;
  }

  var sql = "UPDATE vehicles SET availability = ? where vehicle_id = ?";
  try {
    var result = await queryDB(sql, [0, vehicle_id]);
    console.log({ message: "update vehicles availability already" });
  } catch (err) {
    console.log(err);
    res.send(err, 500);
    return;
  }

  const response = payment.createBill(
    amount_balance,
    tax_amount,
    total_amount,
    id_no,
    id
  );
  console.log(response);

  var sql = "UPDATE customer SET book_id = ? WHERE id_no = ?;";
  try {
    var result = await queryDB(sql, [id, id_no]);
    console.log({ message: "update customer book_id already" });
  } catch (err) {
    console.log(err);
    res.send(err, 500);
    return;
  }
};

router.get("/summary", userMiddleware.isLoggedIn, async (req, res) => {
  let in_id = req.body.insuranceId;
  let vehicle_id = req.body.carId;
  let start_date = req.body.bookDate;
  let end_date = req.body.returnDate;

  if (
    in_id == null ||
    vehicle_id == null ||
    start_date == null ||
    end_date == null
  ) {
    res.send({ message: "some fields are unfilled." }, 400);
    return;
  }

  var sql = "SELECT cost from insurance where in_id = ?";
  try {
    var result = await queryDB(sql, in_id);
    if (result.length == 0) {
      var insu_cost = 0;
    } else {
      insu_cost = result[0].cost;
    }
  } catch (err) {
    console.log(err);
    res.send(err, 500);
    return;
  }

  var sql = "SELECT cost from vehicles where vehicle_id = ?";
  try {
    var result2 = await queryDB(sql, vehicle_id);
    var vehicle_cost = result2[0].cost;
  } catch (err) {
    console.log(err);
    res.send(err, 500);
    return;
  }

  try {
    var diffDays =
      parseInt(end_date.split("-")[2], 10) -
      parseInt(start_date.split("-")[2], 10);
    var amount_balance = diffDays * vehicle_cost + insu_cost;
    var tax_amount = amount_balance * 0.07;
    var total_amount = amount_balance + tax_amount;

    res.send({
      amount_balance: amount_balance,
      tax_amount: tax_amount,
      total_amount: total_amount,
    });
  } catch (err) {
    console.log(err);
    res.send(err, 500);
    return;
  }
});

router.post("/book", userMiddleware.isLoggedIn, async (req, res) => {
  let vehicle_id = req.body.carId;

  var sql = "SELECT availability FROM vehicles WHERE vehicle_id = ?";
  try {
    var result = await queryDB(sql, vehicle_id);
    // if success does below
    let availability = result[0].availability;
    if (availability === 0) {
      res.send({ message: "this car is booked already" }, 400);
    } else {
      doInsertBooking(req, res);
    }
  } catch (err) {
    console.log(err);
    res.send(500, { message: err });
  }
});

const doReturn = async (vehicle_id, res) => {
  var sql = "UPDATE vehicles SET availability = ? where vehicle_id = ?";
  try {
    var result = await queryDB(sql, [1, vehicle_id]);
    res.send(200, { message: "return car already" });
    // if success does below
  } catch (err) {
    console.log(err);
    res.send(500, { message: err });
    return;
  }

  var sql = "UPDATE booking SET status = ? where vehicle_id = ?";
  try {
    var result2 = await queryDB(sql, ["finished", vehicle_id]);
    console.log({ message: "update status finished booking already" });
    // if success does below
  } catch (err) {
    console.log(err);
    //res.send(500, { message: err });
    return;
  }
};

router.put("/return", userMiddleware.isLoggedIn, async (req, res) => {
  let book_id = req.body.bookId;

  var sql = "SELECT bill_status from billing where book_id = ?";
  try {
    var result = await queryDB(sql, book_id);
    // if success does below
    let bill_status = result[0].bill_status;
    if (
      bill_status == "pending" ||
      bill_status == "verification" ||
      bill_status == null
    ) {
      res.send(400, { message: "please pay bill before returning car." });
      return;
    }
  } catch (err) {
    console.log(err);
    res.send(500, { message: err });
    return;
  }

  var sql = "SELECT vehicle_id from booking where book_id = ?";
  try {
    var result = await queryDB(sql, book_id);
    // if success does below
    doReturn(result[0].vehicle_id, res);
  } catch (err) {
    console.log(err);
    res.send(500, { message: err });
    return;
  }
});

module.exports = router;
