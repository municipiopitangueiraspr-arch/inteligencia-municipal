import { ArrowRight, X } from "lucide-react";
import { dataLineage, simulatedTransportRecords } from "../data/dataLineage";

type DataOriginDialogProps = {
  onClose: () => void;
};

export default function DataOriginDialog({ onClose }: DataOriginDialogProps) {
  const origin = dataLineage["school-transport"];
  const unavailableVehicles = simulatedTransportRecords.vehicles.filter(
    (vehicle) => vehicle.status !== "Disponível",
  ).length;
  const availableVehicles =
    simulatedTransportRecords.vehicles.length - unavailableVehicles;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="data-origin-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="origin-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          className="icon-button modal-close"
          onClick={onClose}
          aria-label="Fechar origem dos dados"
        >
          <X size={18} />
        </button>
        <div className="origin-eyebrow">TRILHA DE DADOS · CENÁRIO SIMULADO</div>
        <h2 id="origin-title">De quais cadastros viria esse alerta?</h2>
        <p className="origin-intro">
          O texto executivo não é um campo digitado nem uma informação
          consultada em Pitangueiras. Nesta demonstração, ele é montado a partir
          de registros fictícios com estrutura possível de cadastrar no módulo.
        </p>

        <div
          className="origin-stats"
          aria-label="Totais derivados dos registros"
        >
          <div>
            <strong>{simulatedTransportRecords.vehicles.length}</strong>
            <span>veículos no inventário simulado</span>
          </div>
          <div>
            <strong>
              {availableVehicles} / {simulatedTransportRecords.vehicles.length}
            </strong>
            <span>em operação</span>
          </div>
          <div>
            <strong>
              {simulatedTransportRecords.route.activeStudentCount}
            </strong>
            <span>vínculos ativos na rota readequada</span>
          </div>
        </div>

        <div className="origin-modules">
          {origin.modules.map((module, index) => (
            <div className="origin-module" key={module}>
              <span className="origin-step">0{index + 1}</span>
              <span>{module}</span>
              {index < origin.modules.length - 1 && <ArrowRight size={14} />}
            </div>
          ))}
        </div>

        <div className="origin-columns">
          <div>
            <h3>Registros fictícios relacionados</h3>
            <ul>
              {origin.records.map((record) => (
                <li key={record}>{record}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Campos que precisam ser cadastrados</h3>
            <ul>
              {origin.capturedFields.map((field) => (
                <li key={field}>{field}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="origin-calculation">
          <strong>Regra que gera o destaque</strong>
          <p>{origin.calculation}</p>
        </div>
        <p className="origin-disclaimer">{origin.note}</p>
        <button className="modal-action" onClick={onClose}>
          Voltar à visão do prefeito
        </button>
      </section>
    </div>
  );
}
