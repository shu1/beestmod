// Shuichi Aizawa shu1.dev 2026
"use strict";

var https = require("https");
var express = require("express");
var app = express();
var sqlite3 = require("sqlite3").verbose();
var db = new sqlite3.Database("sqlite.db");

db.run("CREATE TABLE alphavantage(datetime TEXT NOT NULL, function TEXT NOT NULL, symbol TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(function, symbol))", function (err) {
	if (err) {
		console.log(err);
	} else {
		console.warn("table created");
		init("TIME_SERIES_DAILY_ADJUSTED", ["NVDA", "AAPL", "GOOG"]);
		init("DIGITAL_CURRENCY_DAILY", ["BTC", "ETH"]);
	}
})

function init(f, s) {
	for (var i = 0; i < s.length; ++i) {
		get(f, s[i]);
	}
}

app.get("/get", function (req, res) {
	get(req.query.function, req.query.symbol, res);
})

function get(f, s, res) {
	https.get("https://api.massive.com/v2/aggs/ticker/" + (f == "DIGITAL_CURRENCY_DAILY" ? "X:" + s + "USD" : s) + "/range/1/day/2000-01-01/" + new Date().toISOString().slice(0, 10) + "?apiKey=" + process.env.apiKey, function (response) {
		var data = "";
		response.on("data", function (chunk) { data += chunk });
		response.on("end", function () {
			var results = JSON.parse(data).results;
			if (results) {
				console.log(s, "insert", new Date(results[results.length - 1].t).toISOString().slice(0, 10));
				db.run("INSERT OR REPLACE INTO alphavantage(datetime, function, symbol, data) VALUES(datetime('now'), ?, ?, ?)", [f, s, data], function (err) {
					err && console.error(err);
				})
			} else {
				console.warn(s, "denied");
			}
			res && res.send(data);
		})
	})
}

app.get("/", function (req, res) {
	if (!Object.keys(req.query).length) {
		res.redirect("/?stocks=NVDA,AAPL,GOOG&crypto=BTC,ETH&date=2018-08-13");
	} else {
		res.sendFile(__dirname + "/index.html");
	}
})

app.get("/all", function (req, res) {
	db.all("SELECT symbol, datetime FROM alphavantage ORDER BY datetime", function (err, rows) {
		if (err) {
			console.error(err);
			res.status(500).send(err);
		} else {
			res.send(rows);
		}
	})
})

app.get("/one", function (req, res) {
	db.get("SELECT * FROM alphavantage WHERE function=? AND symbol=?", [req.query.function, req.query.symbol], function (err, row) {
		if (err) {
			console.error(err);
			res.status(500).send(err);
		} else {
			res.send(row);
		}
	})
})

app.get("/delete", function (req, res) {
	db.run("DELETE FROM alphavantage WHERE function=? AND symbol=?", [req.query.function, req.query.symbol], function (err) {
		if (err) {
			console.error(err);
			res.status(500).send(err);
		} else {
			console.warn(req.query.symbol, "delete", this["changes"]);
			res.send(this["changes"].toString());
		}
	})
})

app.get("/cron", function (req, res) {
	var date = new Date();
	if (req.query.h && req.query.m) {
		date.setHours(req.query.h, req.query.m, 0);
	}
	cron("TIME_SERIES_DAILY_ADJUSTED", date.toISOString(), 10000000, res);
})

function cron(f, time, prev, res) {
	db.all("SELECT function, symbol FROM alphavantage WHERE function=? AND datetime(datetime) < datetime(?) ORDER BY datetime", [f, time], function (err, rows) {
		if (err) {
			console.error(err);
			res && res.status(500).send(err);
		} else {
			console.log("cron", f, rows.length);
			for (var i = 0; i < 5 && i < rows.length; ++i) {
				get(rows[i].function, rows[i].symbol);
			}
			res && res.send(rows);

			if (rows.length > 5 && rows.length < prev) {
				setTimeout(cron, 65000, f, time, rows.length);
			}
			else if (f == "TIME_SERIES_DAILY_ADJUSTED") {
				setTimeout(cron, 65000, "DIGITAL_CURRENCY_DAILY", time, 10000000);
			}
		}
	})
}

app.get("/query", function (req, res) {
	db.get("SELECT data FROM alphavantage WHERE function=? AND symbol=?", [req.query.function, req.query.symbol], function (err, row) {
		if (err) {
			console.error(err);
			res && res.status(500).send(err);
		}
		else if (row) {

			console.log(req.query.symbol, "in db");
			res.send(row.data);
		} else {
			get(req.query.function, req.query.symbol, res);
		}
	})
})

var listener = app.listen(process.env.PORT, function () {
	console.log("app is listening on", listener.address().port);
})
