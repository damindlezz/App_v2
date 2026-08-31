// Verhindert ein zusaetzliches Konsolenfenster in Windows-Release-Builds.
// Im Debug-/Entwicklungsmodus bleibt die Konsole fuer Diagnoseausgaben sichtbar.
#![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")]

fn main() {
    arabisch_lernen_lib::run();
}
