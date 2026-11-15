/*
 * Calendario del Bebé: cálculo de la línea del tiempo y del .ics.
 *
 * Todo se calcula en el navegador. La fecha de nacimiento no se guarda, no va en la URL
 * y no sale del navegador. Los datos vienen de data/*.py a través de build.py
 * (bloque <script type="application/json" id="datos"> de la página).
 *
 * Las fechas son días sin hora: objetos Date en UTC a medianoche, y solo se opera
 * con métodos UTC, para que la zona horaria y el cambio de hora no muevan ningún día.
 */
(function (global) {
  "use strict";

  var DIA_MS = 86400000;
  var EDAD_MAXIMA_MESES = 36;
  var AVISO =
    "Orientativo. No sustituye al pediatra ni a la enfermera de tu centro de salud, " +
    "que son quienes fijan las citas.";

  // ---------- Fechas ----------

  function fecha(anio, mes, dia) {
    return new Date(Date.UTC(anio, mes - 1, dia));
  }

  function desdeISO(texto) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto || "");
    if (!m) return null;
    var f = fecha(+m[1], +m[2], +m[3]);
    // Rechaza fechas imposibles como 2026-02-30.
    if (f.getUTCFullYear() !== +m[1] || f.getUTCMonth() !== +m[2] - 1 || f.getUTCDate() !== +m[3]) return null;
    return f;
  }

  function dos(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function aISO(f) {
    return f.getUTCFullYear() + "-" + dos(f.getUTCMonth() + 1) + "-" + dos(f.getUTCDate());
  }

  function formatear(f) {
    return dos(f.getUTCDate()) + "/" + dos(f.getUTCMonth() + 1) + "/" + f.getUTCFullYear();
  }

  function hoyLocal(ahora) {
    var d = ahora || new Date();
    return fecha(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }

  function diasDelMes(anio, mes) {
    return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  }

  // «A los N meses»: mismo día N meses después; si no existe, el último día del mes.
  function sumarMeses(f, n) {
    var total = f.getUTCFullYear() * 12 + f.getUTCMonth() + n;
    var anio = Math.floor(total / 12);
    var mes = (total % 12) + 1;
    return fecha(anio, mes, Math.min(f.getUTCDate(), diasDelMes(anio, mes)));
  }

  function sumarDias(f, n) {
    return new Date(f.getTime() + n * DIA_MS);
  }

  function diasEntre(a, b) {
    return Math.round((b.getTime() - a.getTime()) / DIA_MS);
  }

  // Edad de los datos ({"meses": 2}, {"semanas": 1} o {"dias": 0}) → fecha.
  function fechaEdad(nacimiento, edad) {
    if (edad.meses !== undefined) return sumarMeses(nacimiento, edad.meses);
    if (edad.semanas !== undefined) return sumarDias(nacimiento, 7 * edad.semanas);
    if (edad.dias !== undefined) return sumarDias(nacimiento, edad.dias);
    if (edad.horas !== undefined) return sumarDias(nacimiento, Math.floor(edad.horas / 24));
    throw new Error("Edad desconocida: " + JSON.stringify(edad));
  }

  function enMeses(edad) {
    if (edad.meses !== undefined) return edad.meses;
    if (edad.semanas !== undefined) return (edad.semanas * 7) / 30.44;
    if (edad.horas !== undefined) return edad.horas / 24 / 30.44;
    return edad.dias / 30.44;
  }

  // ---------- Textos de edad ----------

  function textoEdad(edad) {
    if (edad.dias === 0) return "al nacer";
    if (edad.horas !== undefined) return "a partir de las " + edad.horas + " horas de vida";
    if (edad.dias !== undefined) return edad.dias + (edad.dias === 1 ? " día" : " días");
    if (edad.semanas !== undefined) return edad.semanas + (edad.semanas === 1 ? " semana" : " semanas");
    var m = edad.meses;
    if (m >= 24 && m % 12 === 0) return m / 12 + " años";
    return m + (m === 1 ? " mes" : " meses");
  }

  function textoRango(desde, hasta) {
    if (desde.horas !== undefined && hasta.horas !== undefined) {
      return "entre las " + desde.horas + " y las " + hasta.horas + " horas de vida";
    }
    if (desde.semanas !== undefined && hasta.semanas !== undefined) {
      return "entre la " + desde.semanas + ".ª y la " + hasta.semanas + ".ª semana";
    }
    if (desde.meses >= 24 && desde.meses % 12 === 0 && hasta.meses % 12 === 0) {
      return "entre los " + desde.meses / 12 + " y los " + hasta.meses / 12 + " años";
    }
    if (desde.meses !== undefined && hasta.meses !== undefined) {
      return "entre los " + desde.meses + " y los " + hasta.meses + " meses";
    }
    return "entre " + edadCorta(desde) + " y " + edadCorta(hasta);
  }

  // «las 6 semanas», «los 12 meses», «los 8 años», «el nacimiento»…
  function edadCorta(edad) {
    if (edad.horas === 0 || edad.dias === 0) return "el nacimiento";
    if (edad.horas !== undefined) return "las " + edad.horas + " horas";
    if (edad.dias !== undefined) return "los " + edad.dias + " días";
    if (edad.semanas !== undefined) return "las " + edad.semanas + " semanas";
    var m = edad.meses;
    if (m >= 24 && m % 12 === 0) return "los " + m / 12 + " años";
    return "los " + m + " meses";
  }

  // ---------- Línea del tiempo ----------

  function citaDe(r) {
    return { fuente: r.fuente, documento: r.documento, apartado: r.apartado, verificado: r.verificado };
  }

  function elementoVacuna(r, extra) {
    var e = { id: r.id, nombre: r.nombre, siglas: r.siglas, nota: r.nota || "", fuente: citaDe(r) };
    if (extra) for (var k in extra) e[k] = extra[k];
    return e;
  }

  // Temporada de campaña (de julio a junio) a la que pertenece una fecha: «2026-2027».
  function temporadaDe(f) {
    var a = f.getUTCFullYear();
    if (f.getUTCMonth() < 6) a -= 1;
    return a + "-" + (a + 1);
  }

  function campanaPublicada(campanas, tipo, temporada) {
    for (var i = 0; i < campanas.length; i++) {
      if (campanas[i].campana === tipo && campanas[i].temporada === temporada) return campanas[i];
    }
    return null;
  }

  function eventoGripe(vacuna, campanas, nacimiento, hoy) {
    var seisMeses = fechaEdad(nacimiento, vacuna.edad_desde);
    var limite = fechaEdad(nacimiento, vacuna.edad_hasta);
    var referencia = seisMeses > hoy ? seisMeses : hoy;
    if (referencia > limite) return null;
    var temporada = temporadaDe(referencia);
    var c = campanaPublicada(campanas, "gripe", temporada);
    var nota = vacuna.nota + " Las fechas de cada campaña las publica la Conselleria en otoño.";
    var evento = {
      id: "gripe-" + temporada,
      tipo: "campaña",
      titulo: "Gripe: campaña " + temporada,
      fecha: seisMeses,
      edadTexto: "desde los 6 meses, cada temporada",
      elementos: [elementoVacuna(vacuna)],
      nota: nota,
      fechaConocida: false,
    };
    if (c) {
      var regla = c.regla || {};
      var nacidoDesde = regla.nacidos_desde ? desdeISO(regla.nacidos_desde) : null;
      if (nacidoDesde && nacimiento < nacidoDesde) return null;
      var inicio = desdeISO(c.inicio);
      var fin = c.fin ? desdeISO(c.fin) : null;
      if (fin && seisMeses > fin) {
        evento.campana = "La campaña " + temporada + " termina el " + formatear(fin) +
          ", antes de que cumpla 6 meses: le tocará la siguiente.";
        evento.fecha = seisMeses;
        evento.titulo = "Gripe: campaña siguiente a la " + temporada;
      } else {
        evento.fecha = seisMeses > inicio ? seisMeses : inicio;
        evento.fechaConocida = true;
        evento.campana = "Campaña " + temporada + ": desde el " + formatear(inicio) +
          (fin ? " hasta el " + formatear(fin) : " (fecha de fin sin publicar)") +
          (seisMeses > inicio ? ". Puede vacunarse desde que cumple 6 meses." : ".");
        evento.fuenteCampana = citaDe(c);
        evento.notaCampana = c.nota;
        evento.fin = fin;
      }
    } else {
      evento.campana = "La campaña " + temporada + " aún no está publicada: la Conselleria publica las fechas en otoño.";
    }
    return evento;
  }

  function eventoVRS(vacuna, campanas, nacimiento) {
    var aplicable = null;
    for (var i = 0; i < campanas.length; i++) {
      var c = campanas[i];
      if (c.campana !== "vrs") continue;
      var desde = desdeISO(c.regla.nacidos_desde);
      var hasta = desdeISO(c.regla.nacidos_hasta);
      if (nacimiento >= desde && nacimiento <= hasta) aplicable = c;
    }
    var evento = {
      id: "vrs",
      tipo: "campaña",
      titulo: "VRS (bronquiolitis): anticuerpo monoclonal",
      fecha: nacimiento,
      edadTexto: "lactantes, según la campaña",
      elementos: [elementoVacuna(vacuna)],
      nota: vacuna.nota,
      fechaConocida: false,
    };
    if (aplicable) {
      var inicio = desdeISO(aplicable.inicio);
      evento.id = "vrs-" + aplicable.temporada;
      evento.titulo = "VRS (bronquiolitis): campaña " + aplicable.temporada;
      evento.fecha = nacimiento > inicio ? nacimiento : inicio;
      evento.fechaConocida = true;
      evento.campana = "Campaña " + aplicable.temporada + ": " + aplicable.poblacion +
        " Empezó el " + formatear(inicio) + (aplicable.fin ? "" : "; la fecha de fin no está publicada") + ".";
      evento.fuenteCampana = citaDe(aplicable);
      evento.notaCampana = aplicable.nota;
      evento.fin = aplicable.fin ? desdeISO(aplicable.fin) : null;
      return evento;
    }
    // Nacido después de la última campaña publicada: aún no hay reglas.
    var ultima = null;
    for (var j = 0; j < campanas.length; j++) {
      if (campanas[j].campana === "vrs") {
        var h = desdeISO(campanas[j].regla.nacidos_hasta);
        if (!ultima || h > ultima) ultima = h;
      }
    }
    if (ultima && nacimiento > ultima) {
      evento.campana = "La campaña que le corresponde aún no está publicada: la Conselleria la publica antes del otoño.";
      return evento;
    }
    // Nacido antes de la primera campaña publicada: su temporada ya no está en la web de la
    // Conselleria. No se inventan reglas: se remite a la cartilla.
    evento.id = "vrs-anterior";
    evento.titulo = "VRS (bronquiolitis): campaña de su temporada";
    evento.campana = "Las reglas de la campaña de VRS de su temporada ya no están publicadas en la web de " +
      "la Conselleria. Si se le puso, figura en la cartilla.";
    return evento;
  }

  function construirLinea(nacimiento, datos, idComunidad, hoy) {
    var com = datos.comunidades[idComunidad];
    if (!com || com.estado !== "verificada") throw new Error("Comunidad sin datos: " + idComunidad);
    var eventos = [];
    var citas = {};

    com.vacunas.forEach(function (v) {
      if (v.tipo === "edad") {
        var f = fechaEdad(nacimiento, v.edad);
        var extra = {};
        var cond = v.condicion || {};
        if (cond.nacidos_desde && nacimiento < desdeISO(cond.nacidos_desde)) {
          extra.calendarioAnterior = true;
        }
        if (cond.cumple_edad_desde && f < desdeISO(cond.cumple_edad_desde)) {
          extra.calendarioAnterior = true;
        }
        if (cond.solo_si) extra.soloSi = cond.solo_si;
        var clave = "vacunas-" + v.edad.meses + "m";
        if (!citas[clave]) {
          citas[clave] = {
            id: clave,
            tipo: "vacunas",
            titulo: "Vacunas de los " + textoEdad(v.edad),
            fecha: f,
            edadTexto: textoEdad(v.edad),
            meses: v.edad.meses,
            elementos: [],
            fechaConocida: true,
          };
          eventos.push(citas[clave]);
        }
        citas[clave].elementos.push(elementoVacuna(v, extra));
      } else if (v.tipo === "rango") {
        eventos.push({
          id: v.id,
          tipo: "vacunas",
          titulo: v.nombre,
          fecha: fechaEdad(nacimiento, v.edad_desde),
          edadTexto: textoRango(v.edad_desde, v.edad_hasta),
          meses: enMeses(v.edad_desde),
          hastaMeses: enMeses(v.edad_hasta),
          rango: true,
          elementos: [elementoVacuna(v)],
          fechaConocida: true,
        });
      } else if (v.tipo === "campaña") {
        var ev = v.campana === "gripe"
          ? eventoGripe(v, com.campanas, nacimiento, hoy)
          : eventoVRS(v, com.campanas, nacimiento);
        if (ev) eventos.push(ev);
      }
    });

    com.revisiones.forEach(function (r) {
      var desde = r.tipo === "edad" ? r.edad : r.edad_desde;
      eventos.push({
        id: r.id,
        tipo: "revision",
        titulo: r.nombre,
        fecha: fechaEdad(nacimiento, desde),
        edadTexto: r.tipo === "edad" ? textoEdad(r.edad) : textoRango(r.edad_desde, r.edad_hasta),
        meses: enMeses(desde),
        rango: r.tipo === "rango",
        elementos: [{ id: r.id, nombre: r.nombre, nota: r.nota || "", fuente: citaDe(r) }],
        fechaConocida: true,
      });
    });

    (com.cribados || []).forEach(function (r) {
      var desde = r.tipo === "edad" ? r.edad : r.edad_desde;
      eventos.push({
        id: r.id,
        tipo: "cribado",
        titulo: r.nombre,
        fecha: fechaEdad(nacimiento, desde),
        edadTexto: r.tipo === "edad" ? textoEdad(r.edad) : textoRango(r.edad_desde, r.edad_hasta),
        meses: enMeses(desde),
        rango: r.tipo === "rango",
        elementos: [{ id: r.id, nombre: r.nombre, nota: r.nota || "", fuente: citaDe(r) }],
        fechaConocida: true,
      });
    });

    (datos.comunes.tramites || []).forEach(function (r) {
      eventos.push({
        id: r.id,
        tipo: "tramite",
        titulo: r.nombre,
        fecha: fechaEdad(nacimiento, r.edad_hasta), // en un trámite importa el final del plazo
        fechaDesde: fechaEdad(nacimiento, r.edad_desde),
        edadTexto: enMeses(r.edad_desde) === 0 ? "hasta " + edadCorta(r.edad_hasta) : textoRango(r.edad_desde, r.edad_hasta),
        meses: enMeses(r.edad_desde),
        hastaMeses: enMeses(r.edad_hasta),
        rango: true,
        elementos: [{ id: r.id, nombre: r.nombre, nota: r.nota || "", fuente: citaDe(r), calculadora: r.calculadora }],
        fechaConocida: true,
      });
    });

    eventosEscuela(com, nacimiento).forEach(function (e) { eventos.push(e); });

    datos.comunes.vacunas_aep.forEach(function (a) {
      var desde = a.tipo === "edad" ? a.edad : a.edad_desde;
      eventos.push({
        id: a.id,
        tipo: "aep",
        titulo: a.nombre,
        fecha: fechaEdad(nacimiento, desde),
        edadTexto: a.tipo === "edad" ? textoEdad(a.edad) : textoRango(a.edad_desde, a.edad_hasta),
        meses: enMeses(desde),
        rango: a.tipo === "rango",
        hastaMeses: a.tipo === "rango" ? enMeses(a.edad_hasta) : undefined,
        relacion: a.relacion,
        elementos: [elementoVacuna(a)],
        nota: datos.comunes.texto_aep,
        fechaConocida: true,
      });
    });

    var limite = sumarMeses(nacimiento, EDAD_MAXIMA_MESES);
    eventos = eventos.filter(function (e) {
      return e.fecha <= limite || e.tipo === "campaña" || e.tipo === "tramite";
    });
    eventos.forEach(function (e) {
      // Una campaña ya empezada sigue abierta mientras no pase su fecha de fin (si se conoce).
      e.enCurso = e.tipo === "campaña" && e.fechaConocida && e.fecha < hoy && !(e.fin && e.fin < hoy);
      e.pasado = e.fecha < hoy && !e.enCurso;
      e.diaNacimiento = e.fecha.getTime() === nacimiento.getTime();
      e.dias = diasEntre(hoy, e.fecha);
    });
    eventos.sort(function (a, b) {
      return a.fecha - b.fecha || orden(a.tipo) - orden(b.tipo) || (a.id < b.id ? -1 : 1);
    });
    return eventos;
  }

  function orden(tipo) {
    return { revision: 0, cribado: 1, vacunas: 2, "campaña": 3, aep: 4, tramite: 5, escuela: 6 }[tipo];
  }

  // Escuela: admisiones publicadas para el año de nacimiento y, si el cole (segundo ciclo)
  // no tiene aún resolución para ese año, la edad de la LOE sin fecha de curso.
  function eventosEscuela(com, nacimiento) {
    var esc = com.escolarizacion;
    if (!esc) return [];
    var anio = String(nacimiento.getUTCFullYear());
    var eventos = [];
    var coleConFecha = false;
    esc.admision.forEach(function (a) {
      var nivel = a.niveles[anio];
      if (!nivel) return;
      if (nivel.indexOf("segundo ciclo") >= 0) coleConFecha = true;
      var desde = desdeISO(a.solicitudes_desde);
      var hasta = desdeISO(a.solicitudes_hasta);
      if (hasta < nacimiento) return; // el plazo se cerró antes de nacer
      eventos.push({
        id: a.id,
        tipo: "escuela",
        titulo: "Admisión curso " + a.curso + ": " + nivel,
        fecha: desde,
        edadTexto: "solicitudes del " + formatear(desde) + " al " + formatear(hasta),
        elementos: [{ id: a.id, nombre: "Admisión curso " + a.curso, nota: a.nota, fuente: citaDe(a) }],
        fechaConocida: true,
        admision: true,
      });
    });
    var segundo = esc.etapas.filter(function (r) { return r.id === "infantil-segundo-ciclo"; })[0];
    if (segundo && !coleConFecha) {
      eventos.push({
        id: segundo.id,
        tipo: "escuela",
        titulo: segundo.nombre,
        fecha: fechaEdad(nacimiento, segundo.edad_desde),
        edadTexto: "desde los 3 años",
        elementos: [{ id: segundo.id, nombre: segundo.nombre, nota: segundo.nota, fuente: citaDe(segundo) }],
        campana: "Qué curso le toca y cuándo se pide plaza lo fija la Conselleria cada año en la " +
          "resolución de admisión del DOGV; la de su curso aún no está publicada.",
        fechaConocida: false,
      });
    }
    return eventos;
  }

  // Campañas abiertas hoy a las que el bebé ya puede ir.
  function enCurso(eventos) {
    return eventos.filter(function (e) { return e.enCurso; });
  }

  // Lo siguiente que toca del calendario oficial (sin recomendaciones AEP).
  function proximo(eventos, hoy) {
    for (var i = 0; i < eventos.length; i++) {
      var e = eventos[i];
      var salud = e.tipo !== "aep" && e.tipo !== "tramite" && e.tipo !== "escuela";
      if (salud && e.fechaConocida && e.fecha >= hoy) return e;
    }
    return null;
  }

  // ---------- .ics (RFC 5545) ----------

  function escaparICS(texto) {
    return String(texto)
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\r?\n/g, "\\n");
  }

  function octetos(caracter) {
    var c = caracter.codePointAt(0);
    return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }

  // Pliega una línea a 75 octetos sin partir caracteres UTF-8.
  function plegar(linea) {
    var partes = [];
    var actual = "";
    var tam = 0;
    var limite = 75;
    Array.from(linea).forEach(function (ch) {
      var n = octetos(ch);
      if (tam + n > limite) {
        partes.push(actual);
        actual = " ";
        tam = 1;
      }
      actual += ch;
      tam += n;
    });
    partes.push(actual);
    return partes.join("\r\n");
  }

  function sello(ahora) {
    return ahora.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  }

  function aFechaICS(f) {
    return aISO(f).replace(/-/g, "");
  }

  function descripcionEvento(e) {
    var lineas = [];
    if (e.rango) lineas.push("Edad: " + e.edadTexto + ".");
    if (e.campana) lineas.push(e.campana);
    e.elementos.forEach(function (el) {
      var t = "• " + el.nombre;
      if (el.calendarioAnterior) t += " (con el calendario anterior: consulta la cartilla)";
      if (el.soloSi) t += " (solo si " + el.soloSi + ")";
      if (el.nota) t += ". " + el.nota;
      lineas.push(t);
      lineas.push("  Fuente: " + el.fuente.documento + ", " + el.fuente.apartado + ". " + el.fuente.fuente);
      if (el.calculadora) lineas.push("  Calculadora: " + el.calculadora);
    });
    if (e.nota) lineas.push(e.nota);
    lineas.push(AVISO);
    return lineas.join("\n");
  }

  function generarICS(eventos, opciones) {
    var ahora = (opciones && opciones.ahora) || new Date();
    var desde = opciones && opciones.desde;
    var dominio = "calendariodelbebe.es";
    var lineas = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Calendario del Bebé//Línea del tiempo//ES",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:Calendario del bebé",
    ];
    eventos.forEach(function (e) {
      if (!e.fechaConocida) return;
      if (desde && e.fecha < desde) return;
      var titulo = e.tipo === "aep" ? "Recomendación AEP: " + e.titulo : e.titulo;
      lineas.push(
        "BEGIN:VEVENT",
        "UID:" + e.id + "@" + dominio,
        "DTSTAMP:" + sello(ahora),
        "DTSTART;VALUE=DATE:" + aFechaICS(e.fecha),
        "DTEND;VALUE=DATE:" + aFechaICS(sumarDias(e.fecha, 1)),
        "SUMMARY:" + escaparICS(titulo + (e.rango ? " (" + e.edadTexto + ")" : "")),
        "DESCRIPTION:" + escaparICS(descripcionEvento(e)),
        "TRANSP:TRANSPARENT",
        "END:VEVENT"
      );
    });
    lineas.push("END:VCALENDAR");
    return lineas.map(plegar).join("\r\n") + "\r\n";
  }

  // ---------- Google Calendar ----------
  //
  // Enlace «Añadir a Google Calendar» por cita (aceptado por Josep el 14/11/2026). Lleva
  // la fecha de la cita en la URL de Google, nunca la de nacimiento: no se ofrece para
  // citas pasadas, sin fecha publicada, campañas ya en curso ni las que caen el mismo
  // día del nacimiento.
  function enlaceGoogle(e) {
    if (!e.fechaConocida || e.pasado || e.enCurso || e.diaNacimiento) return null;
    if (e.tipo === "cribado") return null; // en la maternidad; su fecha delataría la de nacimiento
    var titulo = (e.tipo === "aep" ? "Recomendación AEP: " : "") + e.titulo +
      (e.rango ? " (" + e.edadTexto + ")" : "");
    var detalles = [];
    if (e.campana) detalles.push(e.campana);
    e.elementos.forEach(function (x) {
      detalles.push("• " + x.nombre + (x.soloSi ? " (solo si " + x.soloSi + ")" : "") +
        (x.calendarioAnterior ? " (con el calendario anterior: consulta la cartilla)" : ""));
    });
    var fuentes = [];
    e.elementos.forEach(function (x) {
      if (fuentes.indexOf(x.fuente.fuente) < 0) fuentes.push(x.fuente.fuente);
    });
    detalles.push("Fuente: " + fuentes.join(" "));
    detalles.push(AVISO);
    return "https://calendar.google.com/calendar/render?action=TEMPLATE" +
      "&text=" + encodeURIComponent(titulo) +
      "&dates=" + aFechaICS(e.fecha) + "/" + aFechaICS(sumarDias(e.fecha, 1)) +
      "&details=" + encodeURIComponent(detalles.join("\n"));
  }

  // ---------- Vista gráfica (modelo) ----------
  //
  // La vista gráfica es un resumen de la línea del tiempo en carriles horizontales de
  // 0 a 36 meses. Este modelo no toca el DOM (se prueba en node); pintarVista lo dibuja.
  // La alimentación va por edades, nunca por fechas.

  var MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

  function mesesDesde(nacimiento, f) {
    return diasEntre(nacimiento, f) / 30.4375;
  }

  function etiquetaMeses(m) {
    if (m === 0) return "0";
    if (m % 12 === 0) return m / 12 + (m === 12 ? " año" : " años");
    return m + " m";
  }

  function marcaDeEvento(e, nacimiento) {
    var m = mesesDesde(nacimiento, e.fecha);
    var detalle = (e.fechaConocida ? (e.tipo === "revision" || e.tipo === "cribado" ? "Hacia el " : "A partir del ") + formatear(e.fecha) : "Fecha sin publicar") +
      " · " + e.edadTexto;
    return {
      ref: e.id,
      titulo: e.titulo,
      detalle: detalle,
      desde: m,
      pasado: !!e.pasado,
      sinFecha: !e.fechaConocida,
      cuenta: e.tipo === "vacunas" && !e.rango ? e.elementos.length : 0,
      elementos: e.elementos.map(function (x) { return x.nombre; }),
    };
  }

  // Agrupa registros de alimentación con el mismo rango de edad en una sola barra.
  function barrasAlimentacion(registros, tipo) {
    var grupos = {};
    var orden = [];
    registros.forEach(function (r) {
      if (r.tipo !== tipo) return;
      var d = r.edad_desde ? enMeses(r.edad_desde) : 0;
      var h = r.edad_hasta ? enMeses(r.edad_hasta) : null;
      var clave = d + "-" + h;
      if (!grupos[clave]) {
        grupos[clave] = { desde: d, hasta: h, nombres: [], ids: [], abiertaArriba: !!r.edad_hasta_abierta };
        orden.push(clave);
      }
      grupos[clave].nombres.push(r.nombre);
      grupos[clave].ids.push(r.id);
    });
    return orden.map(function (k) {
      var g = grupos[k];
      var nombres = g.nombres.join(" · ");
      var edad = tipo === "lactancia"
        ? (g.desde === 0 ? "Hasta los " + g.hasta + " meses"
          : "Desde los " + g.desde + " meses hasta los " + (g.hasta % 12 === 0 && g.hasta >= 24 ? g.hasta / 12 + " años" : g.hasta + " meses") + (g.abiertaArriba ? " o más" : ""))
        : tipo === "evitar"
        ? "Evitar hasta los " + (g.hasta >= 24 && g.hasta % 12 === 0 ? g.hasta / 12 + " años" : g.hasta + " meses")
        : g.hasta !== null ? "Entre los " + g.desde + " y los " + g.hasta + " meses" : "Desde los " + g.desde + " meses";
      return {
        ref: "alimentacion-" + g.ids[0],
        titulo: nombres,
        detalle: edad + " (orientativo, cada bebé va a su ritmo)",
        desde: g.desde,
        hasta: g.hasta,
        abierto: g.hasta === null || g.abiertaArriba,
        corta: g.hasta !== null && g.hasta > EDAD_MAXIMA_MESES,
      };
    }).sort(function (a, b) {
      return tipo === "evitar" ? (a.hasta - b.hasta) : (a.desde - b.desde || (a.hasta || 99) - (b.hasta || 99));
    });
  }

  function gripeTemporadas(eventos, datos, nacimiento, carril, max) {
    var gripe = null;
    eventos.forEach(function (e) { if (e.id.indexOf("gripe-") === 0) gripe = e; });
    if (!gripe) return;
    var com = null;
    for (var id in datos.comunidades) if (datos.comunidades[id].campanas) com = datos.comunidades[id];
    var limite = sumarMeses(nacimiento, max);
    var fila = null;
    carril.filas.forEach(function (f) { if (f.length && f[0].corto === "Gripe") fila = f; });
    if (!fila) { fila = []; carril.filas.push(fila); }
    var anio = +gripe.id.slice(6, 10) + 1;
    for (; ; anio++) {
      var temporada = anio + "-" + (anio + 1);
      var c = com ? campanaPublicada(com.campanas, "gripe", temporada) : null;
      var inicio = c ? desdeISO(c.inicio) : fecha(anio, 10, 1);
      if (inicio > limite) break;
      fila.push({
        ref: gripe.id,
        titulo: "Gripe: campaña " + temporada,
        detalle: c
          ? "Campaña " + temporada + " desde el " + formatear(inicio)
          : "Temporada otoño-invierno " + temporada + ": fechas sin publicar. Una dosis por temporada.",
        desde: mesesDesde(nacimiento, inicio),
        forma: "punto",
        sinFecha: !c,
        corto: "Gripe " + temporada,
        elementos: [],
      });
    }
  }

  function construirVista(eventos, datos, nacimiento, hoy) {
    var max = EDAD_MAXIMA_MESES;
    var hoyMeses = mesesDesde(nacimiento, hoy);
    var carriles = [
      { id: "revisiones", nombre: "Revisiones y cribados", filas: [[]] },
      { id: "vacunas", nombre: "Vacunas", filas: [[]] },
      { id: "campanas", nombre: "Campañas", filas: [[]] },
      { id: "aep", nombre: "Recomendación AEP", filas: [[]] },
      { id: "empezar", nombre: "Leche y comida", filas: [] },
      { id: "evitar", nombre: "Comer: evitar", filas: [] },
      { id: "tramites", nombre: "Trámites y permisos", filas: [] },
      { id: "escuela", nombre: "Escuela", filas: [] },
    ];
    var porId = {};
    carriles.forEach(function (c) { porId[c.id] = c; });

    eventos.forEach(function (e) {
      var marca = marcaDeEvento(e, nacimiento);
      if (e.tipo === "revision" || e.tipo === "cribado") {
        marca.forma = "punto";
        porId.revisiones.filas[0].push(marca);
      } else if (e.tipo === "vacunas") {
        if (e.rango) {
          marca.forma = "barra";
          marca.hasta = e.hastaMeses;
          marca.corto = e.elementos[0].siglas;
        } else {
          marca.forma = "punto";
        }
        porId.vacunas.filas[0].push(marca);
      } else if (e.tipo === "campaña") {
        marca.corto = e.id === "vrs-anterior" ? "VRS · su temporada: mira la cartilla" : e.id.indexOf("vrs") === 0 ? "VRS" : "Gripe";
        if (e.fechaConocida) {
          marca.forma = "barra";
          marca.hasta = e.fin ? mesesDesde(nacimiento, e.fin) : null;
          marca.abierto = !e.fin; // fin sin publicar: la barra se difumina
        } else {
          marca.forma = "punto";
        }
        porId.campanas.filas[0].push(marca);
      } else if (e.tipo === "aep") {
        marca.forma = e.rango ? "barra" : "punto";
        if (e.rango) marca.corto = e.elementos[0].nombre;
        if (e.rango) marca.hasta = e.hastaMeses;
        porId.aep.filas[0].push(marca);
      }
    });

    // Las campañas se solapan: una fila por campaña.
    var camp = porId.campanas.filas[0];
    porId.campanas.filas = camp.length ? camp.map(function (m) { return [m]; }) : [[]];

    barrasAlimentacion(datos.comunes.alimentacion, "lactancia").forEach(function (b) {
      b.forma = "barra";
      porId.empezar.filas.push([b]);
    });
    barrasAlimentacion(datos.comunes.alimentacion, "incorporar").forEach(function (b) {
      b.forma = "barra";
      porId.empezar.filas.push([b]);
    });
    barrasAlimentacion(datos.comunes.alimentacion, "evitar").forEach(function (b) {
      b.forma = "barra";
      porId.evitar.filas.push([b]);
    });

    // Trámites: barra del inicio al final del plazo. Las dos inscripciones en el Registro
    // Civil (72 horas y 10 días) van juntas en una sola marca.
    var registro = null;
    eventos.forEach(function (e) {
      if (e.tipo !== "tramite") return;
      var marca = {
        ref: e.id, titulo: e.titulo, forma: "barra",
        detalle: "Hasta el " + formatear(e.fecha) + " · " + e.edadTexto,
        desde: mesesDesde(nacimiento, e.fechaDesde), hasta: e.hastaMeses,
        pasado: !!e.pasado, elementos: [],
      };
      if (e.id.indexOf("registro-civil") === 0) {
        if (registro) {
          registro.detalle += " / " + marca.detalle;
          registro.hasta = Math.max(registro.hasta, marca.hasta);
          return;
        }
        marca.titulo = "Inscripción en el Registro Civil";
        registro = marca;
      }
      porId.tramites.filas.push([marca]);
    });

    // Escuela: etapas de la LOE como barras y admisiones publicadas como puntos.
    var escuela = null;
    for (var idc in datos.comunidades) if (datos.comunidades[idc].escolarizacion) escuela = datos.comunidades[idc].escolarizacion;
    if (escuela) {
      escuela.etapas.forEach(function (r) {
        if (enMeses(r.edad_desde) >= max) return; // el cole empieza a los 3 años: lo marca el punto
        porId.escuela.filas.push([{
          ref: r.id, titulo: r.nombre, forma: "barra",
          detalle: textoRango(r.edad_desde, r.edad_hasta) + ". " + r.nota,
          desde: enMeses(r.edad_desde), hasta: enMeses(r.edad_hasta), elementos: [],
        }]);
      });
      var puntos = [];
      eventos.forEach(function (e) {
        if (e.tipo !== "escuela") return;
        var m = marcaDeEvento(e, nacimiento);
        m.forma = "punto";
        m.corto = e.admision ? "Admisión " + e.titulo.split(":")[0].replace("Admisión curso ", "") : "Cole · curso sin publicar";
        puntos.push(m);
      });
      if (puntos.length) porId.escuela.filas.push(puntos);
    }

    // Gripe: una dosis cada temporada otoño-invierno. Las temporadas siguientes a la del
    // evento, hasta los 36 meses, se marcan aparte: con la campaña si está publicada y,
    // si no, como «sin publicar», situadas en octubre solo como referencia visual.
    gripeTemporadas(eventos, datos, nacimiento, porId.campanas, max);

    // Recorta a 0-36 meses (lo que sigue más allá se marca como «corta»).
    carriles.forEach(function (c) {
      c.filas.forEach(function (fila) {
        fila.forEach(function (m) {
          if (m.hasta !== undefined && m.hasta !== null && m.hasta > max) {
            m.hasta = max;
            m.corta = true;
          }
        });
      });
    });

    return {
      maxMeses: max,
      hoyMeses: hoyMeses >= 0 && hoyMeses <= max ? hoyMeses : null,
      nacimiento: nacimiento,
      carriles: carriles,
    };
  }

  // ---------- Interfaz ----------

  function el(etiqueta, atributos, hijos) {
    var n = document.createElement(etiqueta);
    for (var k in atributos || {}) {
      if (k === "texto") n.textContent = atributos[k];
      else n.setAttribute(k, atributos[k]);
    }
    (hijos || []).forEach(function (h) {
      if (h) n.appendChild(typeof h === "string" ? document.createTextNode(h) : h);
    });
    return n;
  }

  function enlaceFuente(f) {
    return el("a", { href: f.fuente, rel: "noopener", target: "_blank", texto: "Fuente" }, []);
  }

  function textoFecha(e) {
    if (!e.fechaConocida) return "Fecha sin publicar";
    // Las citas las fija el centro de salud: la fecha es la primera posible, no la de la cita.
    if (e.tipo === "tramite") return "Hasta el " + formatear(e.fecha);
    if (e.admision) return "Desde el " + formatear(e.fecha);
    return (e.tipo === "revision" || e.tipo === "cribado" ? "Hacia el " : "A partir del ") + formatear(e.fecha);
  }

  function textoDias(e) {
    if (!e.fechaConocida) return "";
    if (e.enCurso) return "campaña en curso";
    if (e.dias === 0) return "hoy";
    if (e.dias > 0) return "dentro de " + e.dias + (e.dias === 1 ? " día" : " días");
    return "";
  }

  function detalleRevision(x) {
    return el("p", { class: "nota" }, [
      x.nota ? x.nota + " " : "",
      enlaceFuente(x.fuente),
      x.calculadora ? " · " : null,
      x.calculadora ? el("a", { href: x.calculadora, rel: "noopener", target: "_blank", texto: "Calcúlalo con tus fechas en calendariohabil.com" }) : null,
    ]);
  }

  function pintarEvento(e) {
    var lista = el("ul", {}, e.elementos.map(function (x) {
      var extra = [];
      if (x.calendarioAnterior) extra.push(el("strong", { texto: " Con el calendario anterior: consulta la cartilla." }));
      if (x.soloSi) extra.push(" (solo si " + x.soloSi + ")");
      return el("li", {}, [
        el("span", { class: "nombre", texto: x.nombre }),
        x.siglas ? " (" + x.siglas + ")" : "",
      ].concat(extra).concat([
        x.nota ? el("span", { class: "nota", texto: " " + x.nota }) : null,
        " ",
        enlaceFuente(x.fuente),
      ]));
    }));
    var clases = "evento " + (e.tipo === "campaña" ? "campana" : e.tipo) + (e.pasado ? " pasado" : "");
    return el("li", { class: clases }, [
      el("p", { class: "cuando" }, [
        el("strong", { texto: textoFecha(e) }),
        " · " + e.edadTexto + (textoDias(e) ? " · " + textoDias(e) : ""),
      ]),
      el("h3", { texto: e.titulo }),
      e.campana ? el("p", { class: "campana-texto" }, [e.campana, e.fuenteCampana ? " " : "", e.fuenteCampana ? enlaceFuente(e.fuenteCampana) : null]) : null,
      e.notaCampana ? el("p", { class: "nota", texto: e.notaCampana }) : null,
      ["revision", "cribado", "tramite", "escuela"].indexOf(e.tipo) >= 0 ? detalleRevision(e.elementos[0]) : lista,
      enlaceGoogle(e) ? el("p", { class: "google" }, [
        el("a", { href: enlaceGoogle(e), target: "_blank", rel: "noopener noreferrer", texto: "Añadir a Google Calendar" }),
      ]) : null,
    ]);
  }

  // ---------- Vista gráfica (dibujo) ----------

  var SVG_NS = "http://www.w3.org/2000/svg";
  var MARGEN = 14;
  var ALTO_EJE = 44;
  var ALTO_FILA_PUNTO = 40;
  var ALTO_FILA_BARRA = 34;
  var SEPARACION = 8;

  function s(etiqueta, atributos, hijos) {
    var n = document.createElementNS(SVG_NS, etiqueta);
    for (var k in atributos || {}) {
      if (k === "texto") n.textContent = atributos[k];
      else n.setAttribute(k, atributos[k]);
    }
    (hijos || []).forEach(function (h) { if (h) n.appendChild(h); });
    return n;
  }

  function altoFila(fila) {
    return fila.some(function (m) { return m.forma === "punto"; }) ? ALTO_FILA_PUNTO : ALTO_FILA_BARRA;
  }

  function altoCarril(c) {
    return c.filas.reduce(function (t, f) { return t + altoFila(f); }, 0);
  }

  function pintarVista(vista, contenedor) {
    contenedor.textContent = "";
    var disponible = contenedor.clientWidth - 100;
    var PX_MES = Math.max(22, Math.min(40, Math.floor((disponible - MARGEN * 2 - 70) / vista.maxMeses)));
    var x = function (m) { return MARGEN + Math.max(0, Math.min(vista.maxMeses, m)) * PX_MES; };
    var ancho = MARGEN * 2 + vista.maxMeses * PX_MES + 70;
    var carriles = vista.carriles.filter(function (c) {
      return c.filas.some(function (f) { return f.length; });
    });
    var alto = ALTO_EJE + carriles.reduce(function (t, c) { return t + altoCarril(c) + SEPARACION; }, 0);

    var etiquetas = el("div", { class: "vista-carriles", "aria-hidden": "true" }, [el("div", { style: "height:" + ALTO_EJE + "px" })]);
    var desplazable = el("div", { class: "vista-desplazable", tabindex: "0", "aria-label": "Línea del tiempo gráfica de 0 a 36 meses; desplázate en horizontal" });
    var detalle = el("div", { class: "vista-detalle", role: "status", hidden: "hidden" });

    var svg = s("svg", { width: ancho, height: alto, viewBox: "0 0 " + ancho + " " + alto, role: "group", "aria-label": "Vacunas, revisiones, campañas y alimentación de 0 a 36 meses" });
    var defs = s("defs");
    defs.appendChild(s("pattern", { id: "rayado-evitar", width: "6", height: "6", patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, [
      s("rect", { width: "6", height: "6", fill: "#fbe3e2" }),
      s("line", { x1: "0", y1: "0", x2: "0", y2: "6", stroke: "#e34948", "stroke-width": "2.5" }),
    ]));
    ["campanas", "empezar"].forEach(function (id) {
      defs.appendChild(s("linearGradient", { id: "difuminado-" + id, x1: "0", x2: "1", y1: "0", y2: "0" }, [
        s("stop", { offset: "0", style: "stop-color:var(--c-" + id + ");stop-opacity:1" }),
        s("stop", { offset: "1", style: "stop-color:var(--c-" + id + ");stop-opacity:0" }),
      ]));
    });
    svg.appendChild(defs);

    // Rejilla y eje: edad arriba y, debajo, el mes y el año en que la cumple.
    for (var m = 0; m <= vista.maxMeses; m++) {
      var mayor = m % 3 === 0;
      svg.appendChild(s("line", {
        x1: x(m), x2: x(m), y1: ALTO_EJE - (mayor ? 8 : 4), y2: alto,
        class: m % 12 === 0 ? "rejilla anio" : mayor ? "rejilla" : "rejilla menor",
      }));
      if (mayor) {
        svg.appendChild(s("text", { x: x(m), y: 14, class: "eje-edad", "text-anchor": m === 0 ? "start" : "middle", texto: etiquetaMeses(m) }));
        var f = sumarMeses(vista.nacimiento, m);
        svg.appendChild(s("text", {
          x: x(m), y: 29, class: "eje-fecha", "text-anchor": m === 0 ? "start" : "middle",
          texto: MESES_CORTOS[f.getUTCMonth()] + " " + String(f.getUTCFullYear()).slice(2),
        }));
      }
    }

    var marcas = [];
    var y0 = ALTO_EJE;
    carriles.forEach(function (c, i) {
      var h = altoCarril(c);
      if (i % 2 === 0) svg.appendChild(s("rect", { x: 0, y: y0, width: ancho, height: h, class: "banda" }));
      etiquetas.appendChild(el("div", { class: "vista-carril c-" + c.id, style: "height:" + h + "px;margin-bottom:" + SEPARACION + "px" }, [
        el("span", { texto: c.nombre }),
      ]));
      var yf = y0;
      c.filas.forEach(function (fila) {
        var hf = altoFila(fila);
        var centro = yf + hf / 2;
        fila.forEach(function (mk) {
          var g = s("g", {
            class: "marca c-" + c.id + (mk.pasado ? " pasado" : "") + (mk.sinFecha ? " sin-fecha" : ""),
            tabindex: "0", role: "button",
            "aria-label": mk.titulo + ". " + mk.detalle,
          });
          if (mk.forma === "punto") {
            var r = c.id === "vacunas" ? 10 : 7;
            g.appendChild(s("circle", { cx: x(mk.desde), cy: centro, r: 14, class: "zona" }));
            g.appendChild(s("circle", { cx: x(mk.desde), cy: centro, r: r, class: "punto" }));
            if (mk.cuenta) g.appendChild(s("text", { x: x(mk.desde), y: centro + 4, class: "cuenta", "text-anchor": "middle", texto: String(mk.cuenta) }));
            if (mk.corto && (mk.sinFecha || c.id === "escuela")) {
              var aLaIzquierda = x(mk.desde) > ancho - 190;
              g.appendChild(s("text", {
                x: x(mk.desde) + (aLaIzquierda ? -12 : 12), y: centro + 4, class: "texto-barra",
                "text-anchor": aLaIzquierda ? "end" : "start",
                texto: mk.corto + (mk.sinFecha && c.id !== "escuela" && mk.corto.indexOf("cartilla") < 0 ? " · sin publicar" : ""),
              }));
            }
          } else {
            var x1 = x(mk.desde);
            var abierto = mk.abierto && c.id === "campanas";
            var x2 = abierto ? Math.min(x(vista.maxMeses), x1 + 2.5 * PX_MES) : x(mk.hasta === null || mk.hasta === undefined ? vista.maxMeses : mk.hasta);
            var conTexto = ["empezar", "evitar", "tramites", "escuela"].indexOf(c.id) >= 0;
            var yb = conTexto ? yf + hf - 13 : centro - 7;
            var hb = conTexto ? 9 : 14;
            g.appendChild(s("rect", { x: x1, y: yf + 2, width: Math.max(x2 - x1, 16), height: hf - 4, class: "zona" }));
            var relleno = c.id === "evitar" ? "url(#rayado-evitar)" : abierto ? "url(#difuminado-campanas)" : null;
            var barra = s("rect", { x: x1, y: yb, width: Math.max(x2 - x1, 4), height: hb, rx: 4, class: "barra" });
            if (relleno) barra.setAttribute("fill", relleno);
            g.appendChild(barra);
            if (mk.corta || (mk.abierto && !abierto)) {
              g.appendChild(s("path", { d: "M" + (x2 - 1) + " " + (yb - 3) + " l7 " + (hb / 2 + 3) + " l-7 " + (hb / 2 + 3) + "z", class: "flecha" }));
            }
            if (conTexto) {
              g.appendChild(s("text", { x: x1 + 2, y: yf + 13, class: "texto-barra", texto: mk.titulo }));
            } else if (mk.corto) {
              g.appendChild(s("text", {
                x: x2 + 5, y: centro + 4, class: "texto-barra",
                texto: mk.corto + (abierto ? " · fin sin publicar" : ""),
              }));
            }
          }
          marcas.push({ nodo: g, marca: mk });
          svg.appendChild(g);
        });
        yf += hf;
      });
      y0 += h + SEPARACION;
    });

    if (vista.hoyMeses !== null) {
      svg.appendChild(s("line", { x1: x(vista.hoyMeses), x2: x(vista.hoyMeses), y1: 34, y2: alto, class: "hoy" }));
      svg.appendChild(s("text", { x: x(vista.hoyMeses) + 4, y: 42, class: "hoy-texto", texto: "Hoy" }));
    }

    function mostrar(item) {
      var mk = item.marca;
      detalle.textContent = "";
      detalle.appendChild(el("strong", { texto: mk.titulo }));
      detalle.appendChild(el("span", { texto: mk.detalle }));
      if (mk.elementos && mk.elementos.length > 1) {
        detalle.appendChild(el("ul", {}, mk.elementos.map(function (n) { return el("li", { texto: n }); })));
      }
      if (document.getElementById("ev-" + mk.ref) || document.getElementById(mk.ref)) {
        detalle.appendChild(el("em", { texto: "Toca otra vez para ir al detalle con la fuente." }));
      }
      detalle.hidden = false;
      var caja = item.nodo.getBoundingClientRect();
      var base = contenedor.getBoundingClientRect();
      var izq = Math.min(Math.max(caja.left - base.left + caja.width / 2 - 140, 0), Math.max(base.width - 280, 0));
      detalle.style.left = izq + "px";
      detalle.style.top = (caja.bottom - base.top + 6) + "px";
    }
    var activo = null;
    marcas.forEach(function (item) {
      item.nodo.addEventListener("mouseenter", function () { mostrar(item); });
      item.nodo.addEventListener("focus", function () { mostrar(item); });
      item.nodo.addEventListener("mouseleave", function () { if (activo !== item) detalle.hidden = true; });
      item.nodo.addEventListener("click", function () {
        if (activo === item) {
          var destino = document.getElementById("ev-" + item.marca.ref) || document.getElementById(item.marca.ref);
          if (destino) destino.scrollIntoView({ behavior: "smooth", block: "center" });
          activo = null;
          detalle.hidden = true;
          return;
        }
        activo = item;
        mostrar(item);
      });
      item.nodo.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); item.nodo.dispatchEvent(new MouseEvent("click")); }
        if (ev.key === "Escape") { detalle.hidden = true; activo = null; }
      });
    });
    desplazable.addEventListener("scroll", function () { detalle.hidden = true; activo = null; });

    desplazable.appendChild(svg);
    contenedor.appendChild(el("div", { class: "vista-marco" }, [etiquetas, desplazable]));
    contenedor.appendChild(detalle);
    if (vista.hoyMeses !== null) {
      desplazable.scrollLeft = Math.max(0, x(vista.hoyMeses) - desplazable.clientWidth / 3);
    }
  }

  function iniciar() {
    var nodoDatos = document.getElementById("datos");
    if (!nodoDatos) return;
    var datos = JSON.parse(nodoDatos.textContent);
    var form = document.getElementById("formulario");
    var entrada = document.getElementById("nacimiento");
    var comunidad = document.getElementById("comunidad");
    var error = document.getElementById("error");
    var resultado = document.getElementById("resultado");
    var botonICS = document.getElementById("descargar-ics");
    var actuales = null;

    var hoy = hoyLocal();
    entrada.min = aISO(sumarMeses(hoy, -EDAD_MAXIMA_MESES));
    entrada.max = aISO(sumarMeses(hoy, 9));

    function calcular(ev) {
      if (ev) ev.preventDefault();
      hoy = hoyLocal();
      var n = desdeISO(entrada.value);
      error.textContent = "";
      if (!n) {
        error.textContent = "Escribe una fecha válida.";
        resultado.hidden = true;
        return;
      }
      if (n < sumarMeses(hoy, -EDAD_MAXIMA_MESES) || n > sumarMeses(hoy, 9)) {
        error.textContent = "La fecha ha de ser de los últimos 36 meses o de los próximos 9.";
        resultado.hidden = true;
        return;
      }
      actuales = construirLinea(n, datos, comunidad.value, hoy);
      var p = proximo(actuales, hoy);
      var nodoProximo = document.getElementById("proximo");
      nodoProximo.textContent = "";
      enCurso(actuales).forEach(function (e) { nodoProximo.appendChild(pintarEvento(e)); });
      if (p) nodoProximo.appendChild(pintarEvento(p));
      else nodoProximo.appendChild(el("p", { texto: "No queda nada con fecha en el calendario oficial hasta los 36 meses." }));
      var linea = document.getElementById("linea");
      linea.textContent = "";
      var aparte = { aep: 1, tramite: 1, escuela: 1 };
      actuales.filter(function (e) { return !aparte[e.tipo]; }).forEach(function (e) {
        var nodo = pintarEvento(e);
        nodo.id = "ev-" + e.id;
        linea.appendChild(nodo);
      });
      var lineaTramites = document.getElementById("linea-tramites");
      lineaTramites.textContent = "";
      actuales.filter(function (e) { return e.tipo === "tramite" || e.tipo === "escuela"; }).forEach(function (e) {
        var nodo = pintarEvento(e);
        nodo.id = "ev-" + e.id;
        lineaTramites.appendChild(nodo);
      });
      var aep = document.getElementById("linea-aep");
      aep.textContent = "";
      actuales.filter(function (e) { return e.tipo === "aep"; }).forEach(function (e) {
        var nodo = pintarEvento(e);
        nodo.id = "ev-" + e.id;
        aep.appendChild(nodo);
      });
      resultado.hidden = false;
      pintarVista(construirVista(actuales, datos, n, hoy), document.getElementById("vista"));
    }

    form.addEventListener("submit", calcular);
    entrada.addEventListener("change", calcular);
    comunidad.addEventListener("change", calcular);

    botonICS.addEventListener("click", function () {
      if (!actuales) return;
      var ics = generarICS(actuales, { desde: hoyLocal() });
      var blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var a = el("a", { href: url, download: "calendario-bebe.ics" });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });
  }

  var api = {
    fecha: fecha,
    desdeISO: desdeISO,
    aISO: aISO,
    formatear: formatear,
    hoyLocal: hoyLocal,
    sumarMeses: sumarMeses,
    sumarDias: sumarDias,
    fechaEdad: fechaEdad,
    textoEdad: textoEdad,
    textoRango: textoRango,
    temporadaDe: temporadaDe,
    construirLinea: construirLinea,
    proximo: proximo,
    construirVista: construirVista,
    enlaceGoogle: enlaceGoogle,
    enCurso: enCurso,
    escaparICS: escaparICS,
    plegar: plegar,
    generarICS: generarICS,
    AVISO: AVISO,
  };
  global.CalendarioBebe = api;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
    else iniciar();
  }
})(typeof window !== "undefined" ? window : this);
