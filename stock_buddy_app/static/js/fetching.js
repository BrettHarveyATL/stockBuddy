console.log('js file loaded')

function makeCall(tickerName){
    fetch(`https://apidojo-yahoo-finance-v1.p.rapidapi.com/stock/v2/get-financials?symbol=${tickerName}&region=US`)
    .then(res => res.json())
    .then(res => {
        console.log(res);
        document.getElementById('tickerPrice').innerHTML = res['price']['regularMarketPrice']['fmt']
    })
}