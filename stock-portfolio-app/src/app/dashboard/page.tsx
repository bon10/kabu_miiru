export default function Dashboard() {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">株式ポートフォリオ</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">総資産</h2>
          <p className="text-3xl font-bold text-green-600">¥0</p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">今日の損益</h2>
          <p className="text-3xl font-bold text-gray-600">¥0</p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">保有銘柄数</h2>
          <p className="text-3xl font-bold text-blue-600">0</p>
        </div>
      </div>
      
      <div className="mt-8 bg-white rounded-lg shadow-md">
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4">保有銘柄</h2>
          <p className="text-gray-500">まだ銘柄が登録されていません。</p>
        </div>
      </div>
    </div>
  )
}