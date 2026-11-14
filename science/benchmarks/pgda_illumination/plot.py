"""Difference map figure from compare.py --grid-npz output(s)."""
import sys, numpy as np, matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
out, files = sys.argv[1], sys.argv[2:]
fig, ax = plt.subplots(1, 1 + len(files), figsize=(5.2 * (1 + len(files)), 5), constrained_layout=True)
z0 = np.load(files[0])
s = ax[0].scatter(z0["x_km"], z0["y_km"], c=z0["pgda"], s=6, marker="s", cmap="gray", vmin=0, vmax=1)
ax[0].set_title("PGDA AVGVISIB_85S_060M (reference)\nsampled at our 3 km grid"); fig.colorbar(s, ax=ax[0], label="mean solar visibility")
for a, f in zip(ax[1:], files):
    z = np.load(f); d = z["ours_centre"] - z["pgda"]
    s = a.scatter(z["x_km"], z["y_km"], c=d, s=6, marker="s", cmap="RdBu_r", vmin=-0.3, vmax=0.3)
    lab = "100 km" if "100" in f else "30 km (default)"
    a.set_title(f"ours − PGDA, ray range {lab}\nmean {d.mean():+.3f}  MAE {np.abs(d).mean():.3f}  P95 {np.percentile(np.abs(d),95):.3f}")
    fig.colorbar(s, ax=a, label="Δ fraction (red = we see more Sun)")
for a in ax: a.set_aspect("equal"); a.set_xlabel("x km (polar stereo)"); a.set_ylabel("y km"); a.plot(0, 0, "k+")
fig.savefig(out, dpi=110)
