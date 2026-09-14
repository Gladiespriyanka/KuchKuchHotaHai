"""Print the saved evaluation report. Run after train_model.py."""
import json
from pathlib import Path

METRICS = Path(__file__).resolve().parent / "model_metrics.json"


def main() -> None:
    if not METRICS.exists():
        raise SystemExit("model_metrics.json not found — run ml/train_model.py first")
    m = json.loads(METRICS.read_text())
    print(f"Model selected : {m['model_selected']}")
    print(f"Trained on     : {m['trained_on']} ({m['training_rows']} synthetic rows)")
    print(f"Real reference : {m['real_reference_rates']} published rates\n")
    print("Model comparison")
    for name, s in m["comparison"].items():
        print(f"  {name:<28} MAE {s['mae']:>9}  RMSE {s['rmse']:>9}  R2 {s['r2']}")
    print("\nSelected model, per unit")
    for unit, s in m["selected_metrics_per_unit"].items():
        print(f"  {unit:<8} MAE {s['mae']:>9}  RMSE {s['rmse']:>9}  R2 {s['r2']}")
    c = m["unseen_material_check"]
    print(f"\nUnseen-material check   MAE {c['mae']}  RMSE {c['rmse']}  R2 {c['r2']}")
    print("\nInterpretation\n  " + m["interpretation"])
    print("\nLimitations")
    for lim in m["limitations"]:
        print(f"  - {lim}")


if __name__ == "__main__":
    main()
