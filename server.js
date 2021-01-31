// Shuichi Aizawa 2018 github.com/shu1
"use strict";

var https = require("https");
var express = require("express");
var app = express();
var sqlite3 = require("sqlite3").verbose();
var db = new sqlite3.Database("./.data/sqlite.db");

db.run("CREATE TABLE alphavantage(datetime TEXT NOT NULL, function TEXT NOT NULL, symbol TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(function, symbol))", function(err) {
	if (err) {
		console.log(err);
	} else {
		console.warn("table created");
		init("TIME_SERIES_DAILY_ADJUSTED", ["FB","AAPL","AMZN","NFLX","GOOG"]);
		setTimeout(init, 65000, "DIGITAL_CURRENCY_DAILY", ["BTC","BCH","ETH","EOS","XLM"]);
		setTimeout(init, 130000, "DIGITAL_CURRENCY_DAILY", ["XMR","DASH","LTC","XRP","ETC"]);
	}
})

function init(f, s) {
	for (var i=0; i<s.length; ++i) {
		get(f, s[i]);
	}
}

app.get("/get", function(req, res) {
	get(req.query.function, req.query.symbol, res);
})

function get(f, s, res) {
	https.get("https://www.alphavantage.co/query?function=" + f + "&symbol=" + s + "&market=USD&outputsize=full&apikey=" + process.env.apikey, function(response) {
		var data = "";
		response.on("data", function(chunk) {data += chunk});
		response.on("end", function() {
			var parsed = JSON.parse(data);
			if (parsed["Meta Data"]) {
				console.log(s, "insert");
				db.run("INSERT OR REPLACE INTO alphavantage(datetime, function, symbol, data) VALUES(datetime('now'), ?, ?, ?)", [f,s,data], function(err) {
					err && console.error(err);
				})
			} else {
				console.warn(s, "denied");
			}
			res && res.send(data);
		})
	})
}

app.get("/", function(req, res) {
	if (!Object.keys(req.query).length) {
		res.redirect("/?stocks=FB,AAPL,AMZN,NFLX,GOOG&crypto=BTC,BCH,ETH,EOS,XLM,XMR,DASH&date=2018-08-13");
	} else {
		res.sendFile(__dirname + "/index.html");
	}
})

app.get("/all", function(req, res) {
	db.all("SELECT symbol, datetime FROM alphavantage ORDER BY datetime", function(err, rows) {
		if (err) {
			res.send(err);
		} else {
			res.send(rows);
		}
	})
})

app.get("/one", function(req, res) {
	db.get("SELECT * FROM alphavantage WHERE function=? AND symbol=?", [req.query.function, req.query.symbol], function(err, row) {
		if (err) {
			res.send(err);
		} else {
			res.send(row);
		}
	})
})

app.get("/delete", function(req, res) {
	db.run("DELETE FROM alphavantage WHERE function=? AND symbol=?", [req.query.function, req.query.symbol], function(err) {
		console.warn(req.query.symbol, "deleted");
		res.send(err);
	})
})

app.get("/cron", function(req, res) {
	var date = new Date();
	if (req.query.h && req.query.m) {
		date.setHours(req.query.h, req.query.m, 0);
	}
	cron(req.query.f=="c"?"DIGITAL_CURRENCY_DAILY":"TIME_SERIES_DAILY_ADJUSTED", date.toISOString(), 10000000, res);
})

function cron(f, time, prev, res) {
	console.log("cron", f, prev);
	db.all("SELECT function, symbol FROM alphavantage WHERE function=? AND datetime(datetime) < datetime(?) ORDER BY datetime", [f,time], function(err, rows) {
		if (err) {
			console.error(err);
			res && res.status(500).send(err);
		} else {
			for (var i=0; i<5 && i<rows.length; ++i) {
				get(rows[i].function, rows[i].symbol);
			}
			res && res.send(rows);

			if (rows.length > 5 && rows.length < prev) {
				setTimeout(cron, 65000, f, time, rows.length);
			}
		}
	})
}

app.get("/query", function(req, res) {
	db.get("SELECT data FROM alphavantage WHERE function=? AND symbol=?", [req.query.function, req.query.symbol], function(err, row) {
		if (err) {
			console.error(err);
		}
		else if (row) {

			console.log(req.query.symbol, "in db");
			res.send(row.data);
		} else {
			get(req.query.function, req.query.symbol, res);
		}
	})
})

var listener = app.listen(process.env.PORT, function() {
	console.log("app is listening on", listener.address().port);
})
