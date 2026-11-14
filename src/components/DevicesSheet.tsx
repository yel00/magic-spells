import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import * as api from '../spotify/api';
import type { Device } from '../spotify/types';
import { commands } from '../state/player';
import { openSheet, ui } from '../state/ui';
import { DeviceIcon } from './Icons';

export function DevicesSheet() {
  const { pending } = useStore(ui);
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const load = () => api.getDevices().then((d) => live && setDevices(d)).catch(() => live && setDevices((d) => d || []));
    load();
    const id = setInterval(load, 4000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, []);

  const pick = async (d: Device) => {
    if (!d.id || d.is_restricted) return;
    setBusy(d.id);
    await commands.transfer(d.id);
    openSheet('none');
  };

  return (
    <div className="devices">
      {pending && <p className="hint">Pick a speaker to start playing.</p>}
      {devices === null && <div className="status"><span className="spinner" /></div>}
      {devices?.length === 0 && (
        <p className="status">
          No devices found. Open Spotify on a phone or speaker so it shows up here — speakers that have been idle for a
          while drop off Spotify’s list until they’re woken.
        </p>
      )}
      {devices?.map((d) => (
        <button
          key={d.id || d.name}
          className={`device ${d.is_active ? 'device-active' : ''}`}
          disabled={!d.id || d.is_restricted}
          onClick={() => pick(d)}
        >
          <DeviceIcon type={d.type} size={26} />
          <span className="row-text">
            <span className="row-title">{d.name}</span>
            <span className="row-sub">
              {d.is_restricted ? 'Can’t be controlled from here' : d.is_active ? 'Playing here' : d.type}
            </span>
          </span>
          {busy === d.id ? <span className="spinner" /> : d.is_active && <span className="eq"><i /><i /><i /></span>}
        </button>
      ))}
    </div>
  );
}
