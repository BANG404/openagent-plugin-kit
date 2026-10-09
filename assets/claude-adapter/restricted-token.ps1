$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class OpenAgentTokenProbe {
  [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
  [DllImport("advapi32.dll")] static extern bool IsTokenRestricted(IntPtr token);
  public static bool Restricted() {
    IntPtr token;
    if (!OpenProcessToken(GetCurrentProcess(), 8, out token)) throw new System.ComponentModel.Win32Exception();
    try { return IsTokenRestricted(token); } finally { CloseHandle(token); }
  }
}
'@
if (-not [OpenAgentTokenProbe]::Restricted()) { throw 'The caller does not have a restricted Windows token' }
Write-Output '{"restricted_token":true}'
