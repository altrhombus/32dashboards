#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Lets LAN devices reach NodeCG running inside WSL (mirrored networking).

.DESCRIPTION
  With mirrored networking, inbound traffic to WSL passes through the Hyper-V
  firewall, whose default inbound action for the WSL VM is Block. This adds an
  allow rule for the NodeCG port there, plus a matching Windows Defender
  Firewall rule. Both are named "32dashboards-nodecg-<port>" so
  `pnpm check-env` can find them. Safe to re-run: existing rules are replaced.

.PARAMETER Port
  NodeCG's port (cfg/nodecg.json "port"). Default 9090.

.PARAMETER RemoteAddress
  Who may connect, for the Windows Defender rule. Default LocalSubnet (devices
  on the same network). Add a tailnet range later, e.g. "LocalSubnet,100.64.0.0/10".

.EXAMPLE
  # From an elevated PowerShell:
  & '\\wsl.localhost\Ubuntu\home\altrhombus\32dashboards\infra\windows\setup-firewall.ps1'
#>
param(
  [int]$Port = 9090,
  [string]$RemoteAddress = 'LocalSubnet'
)
$ErrorActionPreference = 'Stop'

$wslVmCreatorId = '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}'
$name = "32dashboards-nodecg-$Port"
$displayName = "32dashboards NodeCG (TCP $Port)"

Get-NetFirewallHyperVRule -Name $name -ErrorAction SilentlyContinue | Remove-NetFirewallHyperVRule
New-NetFirewallHyperVRule -Name $name -DisplayName $displayName -Direction Inbound `
  -VMCreatorId $wslVmCreatorId -Protocol TCP -LocalPorts $Port -Action Allow | Out-Null
Write-Host "Hyper-V firewall: allowed inbound TCP $Port into WSL"

Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -Name $name -DisplayName $displayName -Direction Inbound -Protocol TCP `
  -LocalPort $Port -RemoteAddress ($RemoteAddress -split ',') -Profile Any -Action Allow | Out-Null
Write-Host "Windows Defender Firewall: allowed inbound TCP $Port from $RemoteAddress"
