// Shuichi Aizawa 2018 github.com/shu1
"use strict";

var https = require("https");
var express = require("express");
var app = express();
var sqlite3 = require("sqlite3").verbose();
var db = new sqlite3.Database("./.data/sqlite.db");

db.run("CREATE TABLE alphavantage(datetime TEXT NOT NULL, function TEXT NOT NULL, symbol TEXT NOT NULL, json TEXT NOT NULL)", function(err) {
	if (!err) {
		console.error("table created");
		init("TIME_SERIES_DAILY_ADJUSTED", ["FB","AAPL","AMZN","NFLX","GOOG"]);
		setTimeout(init, 1000*65,  "DIGITAL_CURRENCY_DAILY", ["BTC","BCH","ETH","EOS","XLM"]);
		setTimeout(init, 1000*130, "DIGITAL_CURRENCY_DAILY", ["XMR","DASH"]);
	}
});

function init(f, s) {
	for (var i=0; i<5 && i<s.length; ++i) {
		get(f, s[i]);
	}
}

function get(f, s, update, res) {
	https.get("https://www.alphavantage.co/query?function=" + f + "&symbol=" + s + "&market=USD&apikey=" + process.env.apikey, function(response) {
		var data = "";
		response.on("data", function(chunk) {data += chunk});
		response.on("end", function() {
			var parsed = JSON.parse(data);
			if (parsed["Meta Data"]) {
				if (update) {
					var query = "UPDATE alphavantage SET datetime = datetime('now'), json = ? WHERE function = ? AND symbol = ?";
					console.log(s + " update");
				} else {
					var query = "INSERT INTO alphavantage(datetime, json, function, symbol) VALUES(datetime('now'), ?, ?, ?)";
					console.log(s + " insert");
				}

				db.run(query, [data,f,s], function(err) {
					err && console.error(err);
				});
			} else {
				console.error(s + " denied");
				console.log(parsed);
			}
			res && res.send(parsed);
		});
	});
}

app.get("/", function(req, res) {
	res.sendFile(__dirname + "/index.html");
});

app.get("/all", function(req, res) {
	db.all("SELECT symbol, datetime FROM alphavantage", function(err, rows) {
		if (err) {
			res.send(err);
		} else {
			res.send(rows);
		}
	});
});

app.get("/crons", function(req, res) {
	cron("TIME_SERIES_DAILY_ADJUSTED", 10000000, res);
});

app.get("/cronc", function(req, res) {
	cron("DIGITAL_CURRENCY_DAILY", 10000000, res);
});

function cron(f, prev, res) {
	console.log("cron " + f + " " + prev);
	db.all("SELECT function, symbol FROM alphavantage WHERE function = ? AND date(datetime) < date('now') ORDER BY datetime", [f], function(err, rows) {
		if (err) {
			console.error(err);
			res && res.send(err);
		} else {
			for (var i=0; i<5 && i<rows.length; ++i) {
				console.log("cron " + rows[i].symbol);
				get(rows[i].function, rows[i].symbol, true);
			}
			res && res.send(rows);

			if (rows.length > 0 && rows.length < prev) {
				setTimeout(cron, 1000*65, f, rows.length);
			}
		}
	});
}

app.get("/query", function(req, res) {
	db.get("SELECT * FROM alphavantage WHERE function = ? AND symbol = ?", [req.query.function, req.query.symbol], function(err, row) {
		if (err) {
			console.error(err);
		}
		else if (row) {

			var date = new Date(row.datetime);
			var now = new Date();	// must be UTC
			console.log(req.query.symbol + " " + row.datetime);

			if (now.getFullYear() > date.getFullYear()) {
				row = "update";
			}
			else if (now.getMonth() > date.getMonth()) {
				row = "update";
			}
			else if (now.getDate() > date.getDate()) {
				row = "update";
			}
			else {
				res.send(JSON.parse(row.json));
			}
		}

		if (!row || row == "update") {
			console.log(req.query.symbol + " get");
			get(req.query.function, req.query.symbol, row == "update", res);
		}
	});
});

var listener = app.listen(process.env.PORT, function() {
	console.log("listening on " + listener.address().port);
});
