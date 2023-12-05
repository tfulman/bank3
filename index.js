/*
	Adam Fulman - Web Bank - Writing to MongoDB
	I moved everything exceot for the login from json to db collections.
*/

const express = require('express');
const hbs = require('hbs');
const app = express();
const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = "mongodb+srv://adamfulman:maK2oewGever1@cluster0.tkr9fnx.mongodb.net/?retryWrites=true&w=majority"; // mongodb remote access

app.set('view engine', 'hbs');
app.use(express.json());       
app.use(express.urlencoded({extended: true}));
app.use(express.static(__dirname));

const fs = require('fs');

app.listen(3000, () => { console.log("SUCCESS!"); });

app.get('/', (req, res) => {
	res.render('login')
})

app.post('/bankActions', (request, response) => {
	const txtAccountName = request.body.txtAccountName;
	const slctAccountNumber = request.body.slctAccount;
	const radioAction = request.body.radioAction;
	if(radioAction == "Balance"){
		// get the balance & account type for the requsted account
		let accountBalance = getAccountBalance(slctAccountNumber);
		accountBalance.then(function(resultBalance) {
			response.render('balance', {username: txtAccountName, account_number: slctAccountNumber, account_type: resultBalance.accountType, account_balance: resultBalance.balance})
		});
	}
	if(radioAction == "Deposit"){
		response.render('deposit', {username: txtAccountName, account_number: slctAccountNumber })
	}
	if(radioAction == "Withdrawal"){
		response.render('withdrawal.hbs', {username: txtAccountName, account_number: slctAccountNumber })
	}
	if(radioAction == "OpenAccount"){
		let newAccountOptions = getClientNewAccountOptions(txtAccountName);
                newAccountOptions.then(function(result) {
			response.render('openaccount.hbs', {username: txtAccountName, newAccountStatus: "", chequingDisabled: result.chequingDisabled, savingsDisabled: result.savingsDisabled })
                });
	}
})

app.post('/login', (request, response) => {
	const txtUserName = request.body.txtUserName;
	const txtPassword = request.body.txtPassword;
	let validUser = false;
	let validPW = false;
	// loop over the user.json and check if txtUserName is valid, and if pw is correct
	fs.readFile('./views/user.json', 'utf8', (error, data) => {
		let users = (JSON.parse(data));
		let keys = Object.keys(users);
		for(var i = 0; i < keys.length; i++){
			let key = keys[i]; // username!!!!, users[key] is the pw!!!!
			if(key == txtUserName){
				validUser = true;
			}
			if(users[key] == txtPassword){
				validPW = true;
			}
		}
		if(!validUser){
			response.render('login', {status: "Not a registered username"})
			return false;
		}
		if(!validPW){
			response.render('login', {status: "Invalid password"})
			return false;
		}
		// did we get the pw right?
		let availableAccounts = getClientAccounts(txtUserName);
		availableAccounts.then(function(result) {
			response.render('webbank', {username: txtUserName, baStatus: "", availableAccounts: result.availableAccountsOptions, isDisabled: result.isDisabled })
		});
	});

})

app.get('/webbank', (req, res) => {
	if(!req.params.username){
		res.render('login');
		return false;
	}
	res.render('webbank', {baStatus: ""});
})

app.post('/webbankRedirect', (request, response) => {
	const txtAccountName = request.body.txtAccountName;
	let availableAccounts = getClientAccounts(txtAccountName);
	availableAccounts.then(function(result) {
		response.render('webbank', {username: txtAccountName, baStatus: "", availableAccounts: result.availableAccountsOptions, isDisabled: result.isDisabled })
	});
});

app.post('/bankActionsDeposit', (request, response) => {
	const txtAccountName = request.body.txtAccountName;
	const txtAccountNumber = request.body.txtAccountNumber;
	const txtDepositSum = request.body.txtDepositSum;
	// update the db with the deposit sum
	depositToAccount(txtAccountNumber, txtDepositSum);
	// send the user back to webbank
	let availableAccounts = getClientAccounts(txtAccountName);
	availableAccounts.then(function(result) {
		response.render('webbank', {username: txtAccountName, baStatus: "", availableAccounts: result.availableAccountsOptions, isDisabled: result.isDisabled })
	});
});

app.post('/bankActionsWithdrawal', (request, response) => {
	const txtAccountName = request.body.txtAccountName;
	const txtAccountNumber = request.body.txtAccountNumber;
	const txtWithdrawalSum = request.body.txtWithdrawalSum;
	// update the db with the txtWithdrawalSum
	let outOfMoney = withdrawalFromAccount(txtAccountNumber, txtWithdrawalSum);
	outOfMoney.then(function(resultWithdrawal) {
		// send the user back to webbank - if we took more than we had, show insufficient funds
		let availableAccounts = getClientAccounts(txtAccountName);
		availableAccounts.then(function(result) {
			response.render('webbank', {username: txtAccountName, baStatus: resultWithdrawal.outOfMoney, availableAccounts: result.availableAccountsOptions, isDisabled: result.isDisabled })
		});
	});
});

app.post('/bankActionsOpenAccount', (request, response) => {
	const txtAccountName = request.body.txtAccountName;
        const radioAccountType = request.body.radioAccountType;
	// get the highest value of the request account type from the db. Then update the db where user=txtAccountName with the new account number
	let getLastAccountID = getMaxAccountID(radioAccountType);
	getLastAccountID.then(function(resultLastID) {
		let newAccountNumber = 0;
		radioAccountType == "savings" ? newAccountNumber = resultLastID.lastID.savings : newAccountNumber = resultLastID.lastID.chequing;
		newAccountNumber = parseInt(newAccountNumber) + 1; // the last id plus one ensures that all account numbers will remain unique
		// create a new account...
		let newAccount = createClientAccount(txtAccountName, radioAccountType, newAccountNumber); // save
		// get all accounts
		let availableAccounts = getClientAccounts(txtAccountName);
		availableAccounts.then(function(result) {
			response.render('webbank', {username: txtAccountName, baStatus: "", availableAccounts: result.availableAccountsOptions, isDisabled: result.isDisabled })
		});
	});
});

async function getMaxAccountID(accountType) {
	const client = new MongoClient(uri);
	try {
		const database = client.db("bank322");
		const clients_table = database.collection("clients");
		const lastID = await clients_table.findOne({}, {"sort": [[accountType, -1]]}); // this will return the highest/max account number
		return {"lastID": lastID};
	} finally {
		await client.close();
	}
}

async function createClientAccount(txtAccountName, radioAccountType, newAccountNumber) {
	const client = new MongoClient(uri);
	try {
		const database = client.db("bank322");
		const clients_table = database.collection("clients");
		const newAccount = await clients_table.updateOne({username: txtAccountName}, {$set: {[radioAccountType]: newAccountNumber}} ); // [] will treat it as a variable, not string
		const balance_table = database.collection("clientBalance");
		const newAccountBalance = await balance_table.insertOne({"accountNumber": newAccountNumber, accountType: radioAccountType, balance: 0}); // initialize the balance table
	} finally {
		await client.close();
	}
}

async function getClientAccounts(uname) {
	const client = new MongoClient(uri);
	try {
		let availableAccountsOptions = "";
		let isDisabled = "";
		const database = client.db("bank322");
		const clients_table = database.collection("clients");
		const query = { username: uname };
		const availableAccounts = await clients_table.findOne(query);
		if(availableAccounts.chequing != null){
			availableAccountsOptions += `<option value='${availableAccounts.chequing}'>${availableAccounts.chequing}</option>`;
		}
		if(availableAccounts.savings != null){
			availableAccountsOptions += `<option value='${availableAccounts.savings}'>${availableAccounts.savings}</option>`;
		}
		(availableAccounts.chequing != null && availableAccounts.savings != null) ? isDisabled = "disabled" : null;
		return {"availableAccountsOptions": availableAccountsOptions, "isDisabled": isDisabled};
	} finally {
		await client.close();
	}
}

async function getAccountBalance(accountNumber) {
	const client = new MongoClient(uri);
	try {
		const database = client.db("bank322");
		const clients_balance_table = database.collection("clientBalance");
		const queryAB = { "accountNumber": parseInt(accountNumber) }; // parseInt because if we do not treat the field as numeric, there will be no result...
		const accountBalanceData = await clients_balance_table.findOne(queryAB);
		return {"balance": accountBalanceData.balance, "accountType": accountBalanceData.accountType};
	} finally {
		await client.close();
	}
}

async function depositToAccount(accountNumber, txtDepositSum) {
	const client = new MongoClient(uri);
	try {
		const database = client.db("bank322");
		const clients_balance_table = database.collection("clientBalance");
		const queryAD = { "accountNumber": parseInt(accountNumber) }; // converted to int
		const deposit = await clients_balance_table.updateOne(queryAD, { $inc: { balance: parseInt(txtDepositSum)}});
	} finally {
		await client.close();
	}
}

async function withdrawalFromAccount(accountNumber, txtWithdrawalSum) {
	const client = new MongoClient(uri);
	try {
		let outOfMoney = "";
		const database = client.db("bank322");
		const clients_balance_table = database.collection("clientBalance");
		const queryAD = { "accountNumber": parseInt(accountNumber) };
		// get the balance. if the balance minus txtWithdrawalSum is less than zero, do not make the withdrawal, show error message
		const currentBalance = await clients_balance_table.findOne(queryAD);
		if(currentBalance.balance + (parseInt(txtWithdrawalSum))*-1 < 0){ // we went below...
			outOfMoney = "Insufficent Funds!";
			return {"outOfMoney": outOfMoney};
		}
		const withdrawal = await clients_balance_table.updateOne(queryAD, { $inc: { balance: (parseInt(txtWithdrawalSum))*-1}}); // increment command mongodb
		return {"outOfMoney": outOfMoney};
	} finally {
		await client.close();
	}
}

async function getClientNewAccountOptions(txtAccountName){
	const client = new MongoClient(uri);
	try {
		let chequingDisabled = "";
		let savingsDisabled = "";
		const database = client.db("bank322");
		const clients_table = database.collection("clients");
		const query = { username: txtAccountName };
		const currentAccounts = await clients_table.findOne(query);
		if(currentAccounts.chequing != null){
			chequingDisabled = "disabled";
		}
		if(currentAccounts.savings != null){
			savingsDisabled = "disabled";
		}
		return {"chequingDisabled": chequingDisabled, "savingsDisabled": savingsDisabled};
	} finally {
		await client.close();
	}
}
