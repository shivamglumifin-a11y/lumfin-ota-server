export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-center font-mono text-sm">
        <h1 className="text-4xl font-bold mb-4">Lumfin OTA Update Server</h1>
        <p className="text-lg mb-8">Over-the-air update server for Lumfin mobile app</p>
        
        <div className="bg-gray-100 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">API Endpoint</h2>
          <code className="bg-gray-200 p-2 rounded block">
            GET /api/updates?runtimeVersion=1.0.0&platform=ios&channel=production
          </code>
        </div>

        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-4">Usage</h2>
          <pre className="bg-gray-100 p-4 rounded-lg overflow-x-auto">
{`npm run publish -- \\
  --channel production \\
  --platform ios \\
  --runtime-version 1.0.0 \\
  --message "Bug fix: Fixed login issue"`}
          </pre>
        </div>
      </div>
    </main>
  );
}

