// Shuichi Aizawa 2018 github.com/shu1
"use strict";

const express = require("express");
const PORT = process.env.PORT || 5000;
const {Pool} = require("pg");
const pool = new Pool({
	connectionString: process.env.DATABASE_URL,
	ssl: true
});
var prevCron;

express()
	.get("/", (req, res) => res.sendFile(__dirname + "/index.html"))
	.get("/all", async (req, res) => {
		pool.query("SELECT symbol, datetime FROM alphavantage", function(err, result) {
			if (err) {
				res.send(err);
			} else {
				res.send(result);
			}
		});
	})
	.get("/create", async (req, res) => {
		pool.query("CREATE TABLE IF NOT EXISTS alphavantage(datetime TIMESTAMPTZ NOT NULL, function TEXT NOT NULL, symbol TEXT NOT NULL, json TEXT NOT NULL)", function(err, result) {
			if (err) {
				res.send(err);
			} else {
				res.send(result);
			}
		});
	})
	.get("/cron", async (req, res) => {
		prevCron = 10000000;
		cron(res);
	})
	.get("/query", async (req, res) => {
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
	})
	.listen(PORT, () => console.log(`Listening on ${ PORT }`))

function cron(res) {
	pool.query("SELECT function, symbol FROM alphavantage WHERE date_trunc('day', datetime) < CURRENT_DATE ORDER BY datetime", function(err, result) {
		if (err) {
			console.error(err);
			res && res.send(err);
		} else {
			for (var i=0; i<5 && i<result.rowCount; ++i) {
				console.log("cron " + result.rows[i].symbol);
				get(result.rows[i].function, result.rows[i].symbol, true);
			}
			res && res.send(result);

			if (result.rowCount > 0 && result.rowCount < prevCron) {
				prevCron = result.rowCount;
				setTimeout(cron, 1000*60*2);
			}
		}
	});
}

function get(f, s, update, res) {
	var https = require("https");
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
