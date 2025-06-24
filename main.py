import yfinance as yf
import pandas as pd
import matplotlib.pyplot as plt

# 銘柄リスト
symbols = []

# 日本株とアメリカ株を区別
stocks = [s + ".T" if s.isdigit() else s for s in symbols]

# 株価データを保存するためのDataFrame
stock_data = pd.DataFrame(index=stocks)

for symbol in stocks:
    if symbol.strip():  # 空のシンボルをスキップ
        stock = yf.Ticker(symbol)
        data = stock.history(period="1d")
        if not data.empty:
            stock_data.loc[symbol, 'Price'] = data['Close'].iloc[-1]

# CSVに保存
stock_data.to_csv("stock_prices.csv")

# グラフ化
# if not stock_data.empty:
#     stock_data.plot(kind='bar', figsize=(10, 6))
#     plt.title("Stock Prices")
#     plt.xlabel("Stock Symbol")
#     plt.ylabel("Price")
#     plt.show()
# else:
#     print("表示するデータがありません。")
