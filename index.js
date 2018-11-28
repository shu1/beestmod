// Shuichi Aizawa 2018 github.com/shu1
"use strict";

var https = require("https");
var express = require("express");
var app = express();
var {Pool} = require("pg");
var pool = new Pool({connectionString:process.env.DATABASE_URL, ssl:true});

pool.query("CREATE TABLE alphavantage(datetime TIMESTAMPTZ NOT NULL, function TEXT NOT NULL, symbol TEXT NOT NULL, json TEXT NOT NULL)", function(err, result) {
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
					var query = "UPDATE alphavantage SET datetime = NOW(), json = $1 WHERE function = $2 AND symbol = $3";
					console.log(s + " update");
				} else {
					var query = "INSERT INTO alphavantage(datetime, json, function, symbol) VALUES(NOW(), $1, $2, $3)";
					console.log(s + " insert");
				}

				pool.query(query, [data,f,s], function(err, result) {
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
	pool.query("SELECT symbol, datetime FROM alphavantage", function(err, result) {
		if (err) {
			res.send(err);
		} else {
			res.send(result);
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
	pool.query("SELECT function, symbol FROM alphavantage WHERE function = $1 AND date_trunc('day', datetime) < CURRENT_DATE ORDER BY datetime", [f], function(err, result) {
		if (err) {
			console.error(err);
			res && res.send(err);
		} else {
			for (var i=0; i<5 && i<result.rowCount; ++i) {
				console.log("cron " + result.rows[i].symbol);
				get(result.rows[i].function, result.rows[i].symbol, true);
			}
			res && res.send(result);

			if (result.rowCount > 0 && result.rowCount < prev) {
				setTimeout(cron, 1000*65, f, result.rowCount);
			}
		}
	});
}

app.get("/query", function(req, res) {
	pool.query("SELECT * FROM alphavantage WHERE function = $1 AND symbol = $2", [req.query.function, req.query.symbol], function(err, result) {
		if (err) {
			console.error(err);
		}
		else if (result && result.rowCount > 0) {
			var row = result.rows[0];
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
