"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function SettingsPage(): React.ReactElement {
  const searchParams = useSearchParams();
  const connected = searchParams.get("connected");
  const error = searchParams.get("error");

  const [tokenInfo, setTokenInfo] = useState<{
    connected: boolean;
    expires_at: string | null;
    scopes: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkConnection(): Promise<void> {
      try {
        const res = await fetch("/api/etsy/auth/status");
        if (res.ok) {
          setTokenInfo(await res.json());
        } else {
          setTokenInfo({ connected: false, expires_at: null, scopes: null });
        }
      } catch {
        setTokenInfo({ connected: false, expires_at: null, scopes: null });
      } finally {
        setLoading(false);
      }
    }
    checkConnection();
  }, []);

  return (
    <div className="space-y-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-white">Settings</h1>

      {connected === "true" && (
        <div className="bg-green-900/30 border border-green-700 text-green-300 px-4 py-3 rounded-lg text-sm">
          Successfully connected to Etsy!
        </div>
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-lg text-sm">
          OAuth error: {decodeURIComponent(error)}
        </div>
      )}

      {/* Etsy Connection */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-2">Etsy Shop Connection</h2>
        <p className="text-sm text-gray-400 mb-4">
          Connect your Etsy shop to enable automated product publishing.
        </p>

        {loading ? (
          <div className="text-gray-500 text-sm">Checking connection status...</div>
        ) : tokenInfo?.connected ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="flex h-3 w-3 rounded-full bg-green-500" />
              <span className="text-sm text-green-400 font-medium">Connected</span>
            </div>

            {tokenInfo.expires_at && (
              <div className="text-sm text-gray-400">
                Token expires: {new Date(tokenInfo.expires_at).toLocaleString()}
              </div>
            )}

            {tokenInfo.scopes && (
              <div className="text-sm text-gray-400">
                Scopes: {tokenInfo.scopes}
              </div>
            )}

            <a
              href="/api/etsy/auth/start"
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 font-medium rounded-lg transition-colors text-sm"
            >
              Reconnect
            </a>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="flex h-3 w-3 rounded-full bg-gray-500" />
              <span className="text-sm text-gray-400 font-medium">Not connected</span>
            </div>

            <a
              href="/api/etsy/auth/start"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-medium rounded-lg transition-colors text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              Connect Etsy Shop
            </a>
          </div>
        )}
      </div>

      {/* Configuration Help */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-2">API Configuration</h2>
        <p className="text-sm text-gray-400 mb-4">
          These environment variables must be set for Etsy integration:
        </p>
        <div className="space-y-3">
          {[
            { name: "ETSY_API_KEY", desc: "Your Etsy app API key (keystring)" },
            { name: "ETSY_SHARED_SECRET", desc: "Your Etsy app shared secret" },
            { name: "ETSY_SHOP_ID", desc: "Your Etsy shop ID (from shop manager URL)" },
          ].map((v) => (
            <div key={v.name} className="flex items-start gap-3">
              <code className="text-xs bg-gray-800 text-blue-400 px-2 py-1 rounded font-mono shrink-0">
                {v.name}
              </code>
              <span className="text-sm text-gray-400">{v.desc}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-4">
          Register your Etsy developer app at{" "}
          <a href="https://developers.etsy.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">
            developers.etsy.com
          </a>
          . Set the OAuth redirect URI to your domain + <code className="text-xs bg-gray-800 px-1 rounded">/api/etsy/auth/callback</code>.
        </p>
      </div>
    </div>
  );
}
