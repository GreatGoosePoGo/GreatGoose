"""Test-only JSON bridge to the unchanged Python engine supplied in the ZIP."""
import json, os, pathlib, sys, tempfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'simulator'))
request=json.load(sys.stdin)
with tempfile.TemporaryDirectory() as folder:
 path=pathlib.Path(folder)/'config.json'
 config=request.get('config',{})
 if 'random_seed' in config: config['random_seed']=int(config['random_seed'])
 path.write_text(json.dumps(config),encoding='utf-8')
 os.environ['RAID_SIM_CONFIG_PATH']=str(path)
 import super_mega_raid_simulator as e
 import battle_replay as parser
 import battle_playback as playback
 from turn_battle import rebuild
 op=request.get('operation','simulate')
 if op=='parse': result=parser.parse_replay_text(request['text'])
 elif op=='playback': result=playback.build_playback(request['text'])
 elif op=='turn': result=rebuild(request['request'])
 elif op=='batch':
  e.validate_settings();result=e.aggregate_summary()
 elif op=='rng':
  r=e.random.Random(int(request['seed']));result={'random':[r.random() for _ in range(50)],'choices':[r.choice(tuple(range(16))) for _ in range(100)]}
 else:
  e.validate_settings()
  s=e.Simulation(next(iter(e.BOSS_FAST_MOVES.values())),next(iter(e.BOSS_CHARGED_MOVES.values())),e.random.Random(int(config.get('random_seed',42))),detailed=True)
  r=s.run(); text=e.render_battle_replay(s,r,int(config.get('random_seed',42)))
  result={'result':r.__dict__,'actions':s.replay_actions,'replay':parser.parse_replay_text(text),'text':text,'log':s.event_log,'type':s.boss_fast.move_type}
 def safe(value):
  if isinstance(value, int) and not isinstance(value, bool) and abs(value)>2**53-1: return str(value)
  if isinstance(value, dict): return {k:safe(v) for k,v in value.items()}
  if isinstance(value, (list,tuple)): return [safe(v) for v in value]
  return value
 print(json.dumps(safe(result)))
