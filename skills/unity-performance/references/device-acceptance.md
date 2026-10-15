## On-device acceptance and live-ops remediation

Whenever on-device acceptance, a pre-launch pass, or live issue remediation is involved, recommendations must carry both of these measures. An editor-only view is not acceptable.

On-device baselines (PerfDog / WeTest): state the acceptance metrics precisely — mean FPS, jank (including the BigJank definition), PSS peak, temperature and current draw — with baselines per target device tier, and mark which metric each fix is expected to improve. Live-ops remediation (Bugly / CrashSight): interpreting crash rate, ANR, OOM, and stutter reports; symbolicating IL2CPP builds; top-N remediation. Live symptoms must flow back into the diagnostic tree for reproduction and localization. For the detailed definitions and baseline tables, see [references/wetest-bugly-fieldops.md](wetest-bugly-fieldops.md).

For the Tencent-derived field criteria (the UPA memory three-way split, the CPU attribution four-way split, long-message stutter criteria, and the five OOM dimensions), see [references/tencent-optimization-playbook.md](tencent-optimization-playbook.md).
