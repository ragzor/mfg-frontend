function Pipeline({ processes, currentStep, status }) {
  return (
    <div className="pipeline">
      {processes.map((proc, i) => {
        let cls;
        if (status === 'Completed') {
          cls = 'p-done';
        } else if (i < currentStep) {
          cls = 'p-done';
        } else if (i === currentStep && status === 'In Progress') {
          cls = 'p-active';
        } else {
          cls = 'p-pending';
        }
        return (
          <div className="pstep" key={i}>
            {i > 0 && <div className="parrow">›</div>}
            <div className={`pnode ${cls}`}>{proc}</div>
          </div>
        );
      })}
    </div>
  );
}

export default Pipeline;
