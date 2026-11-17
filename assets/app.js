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

  // ---------- Textos (castellano por defecto; otra lengua con usarTextos) ----------
  // Cada texto visible pasa por t("plantilla", {variable: valor}). Las traducciones salen de
  // i18n/<lengua>.json a través de build.py; sin traducción se queda el castellano.
  var TEXTOS = {};

  function usarTextos(textos) {
    TEXTOS = textos || {};
  }

  // Catalán: el artículo se apostrofa ante las fechas del día 1 y del 11 («de l'01/10/2026»).
  // Las mismas reglas están en i18n/__init__.py (APOSTROFAR).
  function apostrofar(s) {
    if (TEXTOS._lengua !== "ca") return s;
    return s.replace(/\b([Dd])el (0?1|11)\//g, "$1e l'$2/")
      .replace(/\b([Pp])el (0?1|11)\//g, "$1er l'$2/")
      .replace(/\b([Aa])l (0?1|11)\//g, "$1 l'$2/")
      .replace(/\bel (0?1|11)\//g, "l'$1/")
      .replace(/\bEl (0?1|11)\//g, "L'$1/");
  }

  function t(plantilla, v) {
    var s = Object.prototype.hasOwnProperty.call(TEXTOS, plantilla) ? TEXTOS[plantilla] : plantilla;
    return apostrofar(v ? s.replace(/\{(\w+)\}/g, function (_, k) { return String(v[k]); }) : s);
  }
  var tr = t; // para funciones con una variable local «t»
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
    if (edad.dias === 0) return t("al nacer");
    if (edad.horas !== undefined) return t("a partir de las {n} horas de vida", { n: edad.horas });
    if (edad.dias !== undefined) return t(edad.dias === 1 ? "{n} día" : "{n} días", { n: edad.dias });
    if (edad.semanas !== undefined) return t(edad.semanas === 1 ? "{n} semana" : "{n} semanas", { n: edad.semanas });
    var m = edad.meses;
    if (m >= 24 && m % 12 === 0) return t("{n} años", { n: m / 12 });
    return t(m === 1 ? "{n} mes" : "{n} meses", { n: m });
  }

  function textoRango(desde, hasta) {
    if (desde.horas !== undefined && hasta.horas !== undefined) {
      return t("entre las {a} y las {b} horas de vida", { a: desde.horas, b: hasta.horas });
    }
    if (desde.semanas !== undefined && hasta.semanas !== undefined) {
      return t("entre la {a}.ª y la {b}.ª semana", { a: desde.semanas, b: hasta.semanas });
    }
    if (desde.meses >= 24 && desde.meses % 12 === 0 && hasta.meses % 12 === 0) {
      return t("entre los {a} y los {b} años", { a: desde.meses / 12, b: hasta.meses / 12 });
    }
    if (desde.meses !== undefined && hasta.meses !== undefined) {
      return t("entre los {a} y los {b} meses", { a: desde.meses, b: hasta.meses });
    }
    return t("entre {a} y {b}", { a: edadCorta(desde), b: edadCorta(hasta) });
  }

  // «las 6 semanas», «los 12 meses», «los 8 años», «el nacimiento»…
  function edadCorta(edad) {
    if (edad.horas === 0 || edad.dias === 0) return t("el nacimiento");
    if (edad.horas !== undefined) return t("las {n} horas", { n: edad.horas });
    if (edad.dias !== undefined) return t("los {n} días", { n: edad.dias });
    if (edad.semanas !== undefined) return edad.semanas === 1 ? t("la primera semana") : t("las {n} semanas", { n: edad.semanas });
    var m = edad.meses;
    if (m >= 24 && m % 12 === 0) return t("los {n} años", { n: m / 12 });
    return t("los {n} meses", { n: m });
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

  // `aut`: quién publica las campañas en la comunidad («la Conselleria», «la Consejería»).
  function eventoGripe(vacuna, campanas, nacimiento, hoy, aut) {
    var seisMeses = fechaEdad(nacimiento, vacuna.edad_desde);
    var limite = fechaEdad(nacimiento, vacuna.edad_hasta);
    var referencia = seisMeses > hoy ? seisMeses : hoy;
    if (referencia > limite) return null;
    var temporada = temporadaDe(referencia);
    var c = campanaPublicada(campanas, "gripe", temporada);
    var nota = vacuna.nota + " " + t("Las fechas de cada campaña las publica {aut} en otoño.", { aut: aut });
    var evento = {
      id: "gripe-" + temporada,
      tipo: "campaña",
      titulo: t("Gripe: campaña {temporada}", { temporada: temporada }),
      fecha: seisMeses,
      edadTexto: t("desde los 6 meses, cada temporada"),
      elementos: [elementoVacuna(vacuna)],
      nota: nota,
      fechaConocida: false,
    };
    if (c) {
      var regla = c.regla || {};
      var nacidoDesde = regla.nacidos_desde ? desdeISO(regla.nacidos_desde) : null;
      if (nacidoDesde && nacimiento < nacidoDesde) return null;
      // Edad máxima de la campaña (p. ej. «hasta los 7 años incluidos»): fuera si ya la pasó al empezar.
      if (regla.edad_maxima && fechaEdad(nacimiento, regla.edad_maxima) < desdeISO(c.inicio)) return null;
      var inicio = desdeISO(c.inicio);
      var fin = c.fin ? desdeISO(c.fin) : null;
      if (fin && seisMeses > fin) {
        evento.campana = t("La campaña {temporada} termina el {fin}, antes de que cumpla 6 meses: le tocará la siguiente.", { temporada: temporada, fin: formatear(fin) });
        evento.fecha = seisMeses;
        evento.titulo = t("Gripe: campaña siguiente a la {temporada}", { temporada: temporada });
      } else {
        evento.fecha = seisMeses > inicio ? seisMeses : inicio;
        evento.fechaConocida = true;
        evento.campana = (fin
          ? t("Campaña {temporada}: desde el {inicio} hasta el {fin}.", { temporada: temporada, inicio: formatear(inicio), fin: formatear(fin) })
          : t("Campaña {temporada}: desde el {inicio} (fecha de fin sin publicar).", { temporada: temporada, inicio: formatear(inicio) })) +
          (seisMeses > inicio ? " " + t("Puede vacunarse desde que cumple 6 meses.") : "");
        evento.fuenteCampana = citaDe(c);
        evento.notaCampana = c.nota;
        evento.fin = fin;
      }
    } else {
      evento.campana = t("La campaña {temporada} aún no está publicada: {aut} publica las fechas en otoño.", { temporada: temporada, aut: aut });
    }
    return evento;
  }

  function eventoVRS(vacuna, campanas, nacimiento, aut) {
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
      titulo: t("VRS (bronquiolitis): anticuerpo monoclonal"),
      fecha: nacimiento,
      edadTexto: t("lactantes, según la campaña"),
      elementos: [elementoVacuna(vacuna)],
      nota: vacuna.nota,
      fechaConocida: false,
    };
    if (aplicable) {
      var inicio = desdeISO(aplicable.inicio);
      evento.id = "vrs-" + aplicable.temporada;
      evento.titulo = t("VRS (bronquiolitis): campaña {temporada}", { temporada: aplicable.temporada });
      evento.fecha = nacimiento > inicio ? nacimiento : inicio;
      evento.fechaConocida = true;
      evento.campana = t("Campaña {temporada}:", { temporada: aplicable.temporada }) + " " + aplicable.poblacion + " " +
        (aplicable.fin ? t("Empezó el {inicio}.", { inicio: formatear(inicio) }) : t("Empezó el {inicio}; la fecha de fin no está publicada.", { inicio: formatear(inicio) }));
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
      evento.campana = t("La campaña que le corresponde aún no está publicada: {aut} la publica antes del otoño.", { aut: aut });
      return evento;
    }
    // Nacido antes de la primera campaña publicada: su temporada ya no está en la web de la
    // comunidad. No se inventan reglas: se remite a la cartilla.
    evento.id = "vrs-anterior";
    evento.titulo = t("VRS (bronquiolitis): campaña de su temporada");
    evento.campana = t("Las reglas de la campaña de VRS de su temporada ya no están publicadas en la web {de_aut}. Si se le puso, figura en la cartilla.", { de_aut: aut.indexOf("el ") === 0 ? t("del") + " " + aut.slice(3) : t("de") + " " + aut });
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
            titulo: t("Vacunas de los {edad}", { edad: textoEdad(v.edad) }),
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
          ? eventoGripe(v, com.campanas, nacimiento, hoy, com.autoridad || t("la consejería"))
          : eventoVRS(v, com.campanas, nacimiento, com.autoridad || t("la consejería"));
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

    (datos.comunes.tramites || []).concat(com.tramites || []).forEach(function (r) {
      eventos.push({
        id: r.id,
        tipo: "tramite",
        titulo: r.nombre,
        fecha: fechaEdad(nacimiento, r.edad_hasta), // en un trámite importa el final del plazo
        fechaDesde: fechaEdad(nacimiento, r.edad_desde),
        edadTexto: enMeses(r.edad_desde) === 0 ? t("hasta {edad}", { edad: edadCorta(r.edad_hasta) }) : textoRango(r.edad_desde, r.edad_hasta),
        meses: enMeses(r.edad_desde),
        hastaMeses: enMeses(r.edad_hasta),
        rango: true,
        elementos: [{ id: r.id, nombre: r.nombre, nota: r.nota || "", fuente: citaDe(r), calculadora: r.calculadora }],
        fechaConocida: true,
      });
    });

    eventosEscuela(com, nacimiento).forEach(function (e) { eventos.push(e); });

    // Las diferencias con la AEP dependen del calendario de cada comunidad.
    (com.vacunas_aep || datos.comunes.vacunas_aep || []).forEach(function (a) {
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

    // Suplementos con edad (vitamina D...): un periodo, no una cita. No van al .ics ni a
    // Google Calendar; el producto y la dosis los indica el pediatra.
    (datos.comunes.suplementos || []).forEach(function (r) {
      if (r.tipo !== "rango" || r.linea === false) return;
      eventos.push({
        id: r.id,
        tipo: "suplemento",
        titulo: r.nombre,
        fecha: fechaEdad(nacimiento, r.edad_desde),
        fechaHasta: fechaEdad(nacimiento, r.edad_hasta),
        edadTexto: textoRango(r.edad_desde, r.edad_hasta),
        meses: enMeses(r.edad_desde),
        hastaMeses: enMeses(r.edad_hasta),
        rango: true,
        elementos: [{ id: r.id, nombre: r.nombre, nota: r.nota, fuente: citaDe(r), soloSi: r.condicion }],
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
      e.pasado = e.tipo === "suplemento" ? e.fechaHasta < hoy : e.fecha < hoy && !e.enCurso;
      e.diaNacimiento = e.fecha.getTime() === nacimiento.getTime();
      e.dias = diasEntre(hoy, e.fecha);
    });
    eventos.sort(function (a, b) {
      return a.fecha - b.fecha || orden(a.tipo) - orden(b.tipo) || (a.id < b.id ? -1 : 1);
    });
    return eventos;
  }

  function orden(tipo) {
    return { revision: 0, cribado: 1, vacunas: 2, "campaña": 3, aep: 4, tramite: 5, escuela: 6, suplemento: 7 }[tipo];
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
        titulo: t("Admisión curso {curso}: {nivel}", { curso: a.curso, nivel: nivel }),
        fecha: desde,
        edadTexto: t("solicitudes del {desde} al {hasta}", { desde: formatear(desde), hasta: formatear(hasta) }),
        elementos: [{ id: a.id, nombre: t("Admisión curso {curso}", { curso: a.curso }), nota: a.nota, fuente: citaDe(a) }],
        fechaConocida: true,
        admision: true,
        curso: a.curso,
      });
    });
    var segundo = esc.etapas.filter(function (r) { return r.id === "infantil-segundo-ciclo"; })[0];
    if (segundo && !coleConFecha) {
      eventos.push({
        id: segundo.id,
        tipo: "escuela",
        titulo: segundo.nombre,
        fecha: fechaEdad(nacimiento, segundo.edad_desde),
        edadTexto: t("desde los 3 años"),
        elementos: [{ id: segundo.id, nombre: segundo.nombre, nota: segundo.nota, fuente: citaDe(segundo) }],
        campana: t("Qué curso le toca y cuándo se pide plaza se fija cada año en la resolución de admisión del {boletin}; la de su curso aún no está publicada.", { boletin: com.boletin || t("boletín oficial") }),
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
      var salud = e.tipo !== "aep" && e.tipo !== "tramite" && e.tipo !== "escuela" && e.tipo !== "suplemento";
      if (salud && e.fechaConocida && e.fecha >= hoy) return e;
    }
    return null;
  }

  // ---------- Embarazo ----------
  //
  // Fecha probable de parto (FPP) = primer día de la última regla (FUR) + 40 semanas
  // (datos.comunes.regla_fpp, guía del INGESA). La semana N empieza N semanas después de
  // la FUR. Las fechas son orientativas: las citas las da el centro de salud.

  function semanasFPP(datos) {
    return (datos.comunes.regla_fpp && datos.comunes.regla_fpp.semanas) || 40;
  }

  function fppDesdeFUR(fur, datos) {
    return sumarDias(fur, semanasFPP(datos) * 7);
  }

  function fechaSemana(fpp, semana, datos) {
    return sumarDias(fpp, (semana.semanas - semanasFPP(datos)) * 7 + (semana.dias || 0));
  }

  // Semanas y días cumplidos de embarazo en la fecha `f`.
  function semanaDeEmbarazo(fpp, f, datos) {
    var dias = semanasFPP(datos) * 7 - diasEntre(f, fpp);
    return { semanas: Math.floor(dias / 7), dias: dias % 7 };
  }

  function textoSemana(s) {
    return s.dias ? t("{n}+{d}", { n: s.semanas, d: s.dias }) : String(s.semanas);
  }

  function textoSemanas(desde, hasta) {
    if (!desde && hasta) return t("hasta la semana {b}", { b: textoSemana(hasta) });
    if (desde && hasta === undefined) return t("semana {a}", { a: textoSemana(desde) });
    if (desde && hasta === null) return t("desde la semana {a}", { a: textoSemana(desde) });
    return t("semanas {a} a {b}", { a: textoSemana(desde), b: textoSemana(hasta) });
  }

  // Registros del embarazo de una comunidad: los comunes que no sustituye y los suyos.
  function registrosEmbarazo(datos, idComunidad) {
    var com = comunidadDe(datos, idComunidad);
    var fuera = com.embarazo_sustituye || [];
    return (datos.comunes.embarazo || []).filter(function (r) { return fuera.indexOf(r.id) < 0; })
      .concat(com.embarazo || []);
  }

  function construirEmbarazo(fpp, datos, idComunidad, hoy) {
    var com = comunidadDe(datos, idComunidad);
    var fur = sumarDias(fpp, -semanasFPP(datos) * 7);
    var eventos = [];
    registrosEmbarazo(datos, idComunidad).forEach(function (r) {
      if (r.linea === false || r.cualquier_trimestre) return;
      var desde = r.semana || r.semana_desde;
      if (!desde) return; // «hasta la semana N» sin inicio: pauta, no cita
      var hasta = r.semana ? undefined : r.semana_hasta;
      var fecha = fechaSemana(fpp, desde, datos);
      var fechaHasta = hasta ? fechaSemana(fpp, { semanas: hasta.semanas, dias: hasta.dias === undefined ? 6 : hasta.dias }, datos) : null;
      eventos.push({
        id: r.id,
        tipo: "embarazo",
        subtipo: r.tipo,
        titulo: r.nombre,
        fecha: fecha,
        fechaHasta: fechaHasta,
        abierto: hasta === null,
        edadTexto: textoSemanas(desde, hasta),
        rango: hasta !== undefined,
        elementos: [{ id: r.id, nombre: r.nombre, nota: r.nota, fuente: citaDe(r), soloSi: r.condicion }],
        fechaConocida: true,
      });
    });
    // Vacunas de campaña (gripe, COVID-19): solo con las fechas que publica la comunidad.
    registrosEmbarazo(datos, idComunidad).forEach(function (r) {
      if (!r.cualquier_trimestre || !r.campana) return;
      (com.embarazo_campanas || []).forEach(function (c) {
        if (c.campana !== r.campana) return;
        var inicio = desdeISO(c.inicio);
        var fin = c.fin ? desdeISO(c.fin) : null;
        if (inicio > fpp || (fin && fin < fur) || (fin && fin < hoy)) return;
        var fecha = inicio > fur ? inicio : fur;
        eventos.push({
          id: r.id + "-" + c.temporada,
          tipo: "embarazo",
          subtipo: "campaña",
          titulo: t("{vacuna} en el embarazo: campaña {temporada}", { vacuna: r.nombre, temporada: c.temporada }),
          fecha: fecha,
          fin: fin,
          edadTexto: t("en cualquier trimestre"),
          campana: c.fin
            ? t("Campaña {temporada}: desde el {inicio} hasta el {fin}.", { temporada: c.temporada, inicio: formatear(inicio), fin: formatear(fin) })
            : t("Campaña {temporada}: desde el {inicio} (fecha de fin sin publicar).", { temporada: c.temporada, inicio: formatear(inicio) }),
          fuenteCampana: citaDe(c),
          notaCampana: c.nota,
          elementos: [{ id: r.id, nombre: r.nombre, nota: r.nota, fuente: citaDe(r) }],
          fechaConocida: true,
        });
      });
    });
    eventos.push({
      id: "fecha-probable-parto",
      tipo: "embarazo",
      subtipo: "parto",
      titulo: t("Fecha probable de parto"),
      fecha: fpp,
      edadTexto: t("semana {a}", { a: semanasFPP(datos) }),
      elementos: [{ id: datos.comunes.regla_fpp.id, nombre: t("Fecha probable de parto"), nota: datos.comunes.regla_fpp.nota, fuente: citaDe(datos.comunes.regla_fpp) }],
      fechaConocida: true,
    });
    eventos.forEach(function (e) {
      e.enCurso = e.subtipo === "campaña" && e.fecha < hoy && !(e.fin && e.fin < hoy);
      e.pasado = (e.fechaHasta || e.fecha) < hoy && !e.enCurso;
      e.dias = diasEntre(hoy, e.fecha);
    });
    eventos.sort(function (a, b) { return a.fecha - b.fecha || (a.id < b.id ? -1 : 1); });
    return eventos;
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
    if (e.rango) lineas.push(e.tipo === "embarazo" ? t("Embarazo: {semanas}.", { semanas: e.edadTexto }) : t("Edad: {edad}.", { edad: e.edadTexto }));
    if (e.campana) lineas.push(e.campana);
    e.elementos.forEach(function (el) {
      var t = "• " + el.nombre;
      if (el.calendarioAnterior) t += " " + tr("(con el calendario anterior: consulta la cartilla)");
      if (el.soloSi) t += " " + tr("(solo si {condicion})", { condicion: el.soloSi });
      if (el.nota) t += ". " + el.nota;
      lineas.push(t);
      lineas.push("  " + tr("Fuente:") + " " + el.fuente.documento + ", " + el.fuente.apartado + ". " + el.fuente.fuente);
      if (el.calculadora) lineas.push("  " + tr("Calculadora:") + " " + el.calculadora);
    });
    if (e.nota) lineas.push(e.nota);
    lineas.push(t(AVISO));
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
      "X-WR-CALNAME:" + t("Calendario del bebé"),
    ];
    eventos.forEach(function (e) {
      if (!e.fechaConocida || e.tipo === "suplemento") return;
      if (desde && e.fecha < desde) return;
      var titulo = e.tipo === "aep" ? t("Recomendación AEP:") + " " + e.titulo : e.titulo;
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
    if (!e.fechaConocida || e.pasado || e.enCurso || e.diaNacimiento || e.tipo === "suplemento") return null;
    if (e.dias < 0) return null; // ya empezó (rangos del embarazo en curso)
    if (e.tipo === "cribado") return null; // en la maternidad; su fecha delataría la de nacimiento
    var titulo = (e.tipo === "aep" ? t("Recomendación AEP:") + " " : "") + e.titulo +
      (e.rango ? " (" + e.edadTexto + ")" : "");
    var detalles = [];
    if (e.campana) detalles.push(e.campana);
    e.elementos.forEach(function (x) {
      detalles.push("• " + x.nombre + (x.soloSi ? " " + t("(solo si {condicion})", { condicion: x.soloSi }) : "") +
        (x.calendarioAnterior ? " " + t("(con el calendario anterior: consulta la cartilla)") : ""));
    });
    var fuentes = [];
    e.elementos.forEach(function (x) {
      if (fuentes.indexOf(x.fuente.fuente) < 0) fuentes.push(x.fuente.fuente);
    });
    detalles.push(t("Fuente:") + " " + fuentes.join(" "));
    detalles.push(t(AVISO));
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
  function mesCorto(i) {
    return t(MESES_CORTOS[i]);
  }

  function mesesDesde(nacimiento, f) {
    return diasEntre(nacimiento, f) / 30.4375;
  }

  function etiquetaMeses(m) {
    if (m === 0) return "0";
    if (m % 12 === 0) return t(m === 12 ? "{n} año" : "{n} años", { n: m / 12 });
    return t("{n} m", { n: m });
  }

  function marcaDeEvento(e, nacimiento) {
    var m = mesesDesde(nacimiento, e.fecha);
    var detalle = (e.fechaConocida ? t(e.tipo === "revision" || e.tipo === "cribado" ? "Hacia el {fecha}" : "A partir del {fecha}", { fecha: formatear(e.fecha) }) : t("Fecha sin publicar")) +
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
        ? (g.desde === 0 ? t("Hasta los {n} meses", { n: g.hasta })
          : (g.hasta % 12 === 0 && g.hasta >= 24
            ? t("Desde los {a} meses hasta los {b} años", { a: g.desde, b: g.hasta / 12 })
            : t("Desde los {a} meses hasta los {b} meses", { a: g.desde, b: g.hasta })) + (g.abiertaArriba ? " " + t("o más") : ""))
        : tipo === "evitar"
        ? (g.hasta >= 24 && g.hasta % 12 === 0 ? t("Evitar hasta los {n} años", { n: g.hasta / 12 }) : t("Evitar hasta los {n} meses", { n: g.hasta }))
        : g.hasta !== null ? t("Entre los {a} y los {b} meses", { a: g.desde, b: g.hasta }) : t("Desde los {n} meses", { n: g.desde });
      return {
        ref: "alimentacion-" + g.ids[0],
        titulo: nombres,
        detalle: edad + " " + t("(orientativo, cada bebé va a su ritmo)"),
        desde: g.desde,
        hasta: g.hasta,
        abierto: g.hasta === null || g.abiertaArriba,
        corta: g.hasta !== null && g.hasta > EDAD_MAXIMA_MESES,
      };
    }).sort(function (a, b) {
      return tipo === "evitar" ? (a.hasta - b.hasta) : (a.desde - b.desde || (a.hasta || 99) - (b.hasta || 99));
    });
  }

  // Comunidad de la vista: la indicada o, si no, la primera verificada.
  function comunidadDe(datos, idComunidad) {
    if (idComunidad && datos.comunidades[idComunidad]) return datos.comunidades[idComunidad];
    for (var id in datos.comunidades) if (datos.comunidades[id].estado === "verificada") return datos.comunidades[id];
    return null;
  }

  function gripeTemporadas(eventos, datos, nacimiento, carril, max, idComunidad) {
    var gripe = null;
    eventos.forEach(function (e) { if (e.id.indexOf("gripe-") === 0) gripe = e; });
    if (!gripe) return;
    var com = comunidadDe(datos, idComunidad);
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
        titulo: t("Gripe: campaña {temporada}", { temporada: temporada }),
        detalle: c
          ? t("Campaña {temporada} desde el {inicio}", { temporada: temporada, inicio: formatear(inicio) })
          : t("Temporada otoño-invierno {temporada}: fechas sin publicar. Una dosis por temporada.", { temporada: temporada }),
        desde: mesesDesde(nacimiento, inicio),
        forma: "punto",
        sinFecha: !c,
        corto: t("Gripe {temporada}", { temporada: temporada }),
        elementos: [],
      });
    }
  }

  function construirVista(eventos, datos, nacimiento, hoy, idComunidad) {
    var max = EDAD_MAXIMA_MESES;
    var hoyMeses = mesesDesde(nacimiento, hoy);
    var carriles = [
      { id: "revisiones", nombre: t("Revisiones y cribados"), filas: [[]] },
      { id: "vacunas", nombre: t("Vacunas"), filas: [[]] },
      { id: "campanas", nombre: t("Campañas"), filas: [[]] },
      { id: "aep", nombre: t("Recomendación AEP"), filas: [[]] },
      { id: "empezar", nombre: t("Leche y comida"), filas: [] },
      { id: "evitar", nombre: t("Comer: evitar"), filas: [] },
      { id: "tramites", nombre: t("Trámites y permisos"), filas: [] },
      { id: "escuela", nombre: t("Escuela"), filas: [] },
      { id: "suplementos", nombre: t("Suplementos"), filas: [] },
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
        marca.corto = e.id === "vrs-anterior" ? t("VRS · su temporada: mira la cartilla") : e.id.indexOf("vrs") === 0 ? "VRS" : t("Gripe");
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
        detalle: t("Hasta el {fecha}", { fecha: formatear(e.fecha) }) + " · " + e.edadTexto,
        desde: mesesDesde(nacimiento, e.fechaDesde), hasta: e.hastaMeses,
        pasado: !!e.pasado, elementos: [],
      };
      if (e.id.indexOf("registro-civil") === 0) {
        if (registro) {
          registro.detalle += " / " + marca.detalle;
          registro.hasta = Math.max(registro.hasta, marca.hasta);
          return;
        }
        marca.titulo = t("Inscripción en el Registro Civil");
        registro = marca;
      }
      porId.tramites.filas.push([marca]);
    });

    // Escuela: etapas de la LOE como barras y admisiones publicadas como puntos.
    var comVista = comunidadDe(datos, idComunidad);
    var escuela = comVista ? comVista.escolarizacion : null;
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
        m.corto = e.admision ? t("Admisión {curso}", { curso: e.curso }) : t("Cole · curso sin publicar");
        puntos.push(m);
      });
      if (puntos.length) porId.escuela.filas.push(puntos);
    }

    // Suplementos con edad: barra del periodo.
    eventos.forEach(function (e) {
      if (e.tipo !== "suplemento") return;
      porId.suplementos.filas.push([{
        ref: e.id, forma: "barra",
        titulo: e.titulo + (e.elementos[0].soloSi ? " " + t("(si {condicion})", { condicion: e.elementos[0].soloSi }) : ""),
        detalle: e.edadTexto + ". " + t("El producto y la dosis te los indica el pediatra."),
        desde: e.meses, hasta: e.hastaMeses, pasado: !!e.pasado, elementos: [],
      }]);
    });

    // Gripe: una dosis cada temporada otoño-invierno. Las temporadas siguientes a la del
    // evento, hasta los 36 meses, se marcan aparte: con la campaña si está publicada y,
    // si no, como «sin publicar», situadas en octubre solo como referencia visual.
    gripeTemporadas(eventos, datos, nacimiento, porId.campanas, max, idComunidad);

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
    return el("a", { href: f.fuente, rel: "noopener", target: "_blank", texto: t("Fuente") }, []);
  }

  function textoFecha(e) {
    if (!e.fechaConocida) return t("Fecha sin publicar");
    // Las citas las fija el centro de salud: la fecha es la primera posible, no la de la cita.
    if (e.tipo === "embarazo") {
      if (e.fechaHasta) return t("Del {desde} al {hasta}", { desde: formatear(e.fecha), hasta: formatear(e.fechaHasta) });
      if (e.abierto || e.subtipo === "campaña") return t("Desde el {fecha}", { fecha: formatear(e.fecha) });
      return t("Hacia el {fecha}", { fecha: formatear(e.fecha) });
    }
    if (e.tipo === "tramite") return t("Hasta el {fecha}", { fecha: formatear(e.fecha) });
    if (e.tipo === "suplemento") return t("Del {desde} al {hasta}", { desde: formatear(e.fecha), hasta: formatear(e.fechaHasta) });
    if (e.admision) return t("Desde el {fecha}", { fecha: formatear(e.fecha) });
    return t(e.tipo === "revision" || e.tipo === "cribado" ? "Hacia el {fecha}" : "A partir del {fecha}", { fecha: formatear(e.fecha) });
  }

  function textoDias(e) {
    if (!e.fechaConocida) return "";
    if (e.enCurso) return t("campaña en curso");
    if (e.dias === 0) return t("hoy");
    if (e.dias > 0) return t(e.dias === 1 ? "dentro de {n} día" : "dentro de {n} días", { n: e.dias });
    return "";
  }

  function detalleRevision(x) {
    return el("p", { class: "nota" }, [
      x.soloSi ? el("strong", { texto: t("Solo si {condicion}.", { condicion: x.soloSi }) + " " }) : null,
      x.nota ? x.nota + " " : "",
      enlaceFuente(x.fuente),
      x.calculadora ? " · " : null,
      x.calculadora ? el("a", { href: x.calculadora, rel: "noopener", target: "_blank", texto: t("Calcúlalo con tus fechas en calendariohabil.com") }) : null,
    ]);
  }

  function pintarEvento(e) {
    var lista = el("ul", {}, e.elementos.map(function (x) {
      var extra = [];
      if (x.calendarioAnterior) extra.push(el("strong", { texto: " " + t("Con el calendario anterior: consulta la cartilla.") }));
      if (x.soloSi) extra.push(" " + t("(solo si {condicion})", { condicion: x.soloSi }));
      return el("li", {}, [
        el("span", { class: "nombre", texto: x.nombre }),
        x.siglas ? " (" + x.siglas + ")" : "",
      ].concat(extra).concat([
        x.nota ? el("span", { class: "nota", texto: " " + x.nota }) : null,
        " ",
        enlaceFuente(x.fuente),
      ]));
    }));
    var clases = "evento " + (e.tipo === "campaña" ? "campana" : e.tipo) +
      (e.subtipo ? " " + (e.subtipo === "campaña" ? "campana" : e.subtipo) : "") + (e.pasado ? " pasado" : "");
    return el("li", { class: clases }, [
      el("p", { class: "cuando" }, [
        el("strong", { texto: textoFecha(e) }),
        " · " + e.edadTexto + (textoDias(e) ? " · " + textoDias(e) : ""),
      ]),
      el("h3", { texto: e.titulo }),
      e.campana ? el("p", { class: "campana-texto" }, [e.campana, e.fuenteCampana ? " " : "", e.fuenteCampana ? enlaceFuente(e.fuenteCampana) : null]) : null,
      e.notaCampana ? el("p", { class: "nota", texto: e.notaCampana }) : null,
      ["revision", "cribado", "tramite", "escuela", "suplemento"].indexOf(e.tipo) >= 0 ||
        (e.tipo === "embarazo" && e.subtipo !== "campaña") ? detalleRevision(e.elementos[0]) : lista,
      enlaceGoogle(e) ? el("p", { class: "google" }, [
        el("a", { href: enlaceGoogle(e), target: "_blank", rel: "noopener noreferrer", texto: t("Añadir a Google Calendar") }),
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
    var desplazable = el("div", { class: "vista-desplazable", tabindex: "0", "aria-label": t("Línea del tiempo gráfica de 0 a 36 meses; desplázate en horizontal") });
    var detalle = el("div", { class: "vista-detalle", role: "status", hidden: "hidden" });

    var svg = s("svg", { width: ancho, height: alto, viewBox: "0 0 " + ancho + " " + alto, role: "group", "aria-label": t("Vacunas, revisiones, campañas y alimentación de 0 a 36 meses") });
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
          texto: mesCorto(f.getUTCMonth()) + " " + String(f.getUTCFullYear()).slice(2),
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
                texto: mk.corto + (mk.sinFecha && c.id !== "escuela" && mk.corto.indexOf(t("cartilla")) < 0 ? " · " + t("sin publicar") : ""),
              }));
            }
          } else {
            var x1 = x(mk.desde);
            var abierto = mk.abierto && c.id === "campanas";
            var x2 = abierto ? Math.min(x(vista.maxMeses), x1 + 2.5 * PX_MES) : x(mk.hasta === null || mk.hasta === undefined ? vista.maxMeses : mk.hasta);
            var conTexto = ["empezar", "evitar", "tramites", "escuela", "suplementos"].indexOf(c.id) >= 0;
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
                texto: mk.corto + (abierto ? " · " + t("fin sin publicar") : ""),
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
      svg.appendChild(s("text", { x: x(vista.hoyMeses) + 4, y: 42, class: "hoy-texto", texto: t("Hoy") }));
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
        detalle.appendChild(el("em", { texto: t("Toca otra vez para ir al detalle con la fuente.") }));
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
    usarTextos(datos.textos);
    var form = document.getElementById("formulario");
    var entrada = document.getElementById("nacimiento");
    var comunidad = document.getElementById("comunidad");
    var error = document.getElementById("error");
    var resultado = document.getElementById("resultado");
    var botonICS = document.getElementById("descargar-ics");
    var botonNacido = document.getElementById("modo-nacido");
    var botonEmbarazo = document.getElementById("modo-embarazo");
    var etiquetaFecha = document.getElementById("etiqueta-fecha");
    var campoReferencia = document.getElementById("campo-referencia");
    var referencia = document.getElementById("referencia");
    var bloqueEmbarazo = document.getElementById("bloque-embarazo");
    var actuales = null;
    var deEmbarazo = [];
    var modo = "nacido";

    var hoy = hoyLocal();

    // Límites del campo de fecha según el modo: nacido (36 meses atrás), fecha probable de
    // parto (de hoy a 42 semanas) o primer día de la última regla (42 semanas atrás a hoy).
    function limites() {
      if (modo === "nacido") return [sumarMeses(hoy, -EDAD_MAXIMA_MESES), hoy];
      if (referencia.value === "fur") return [sumarDias(hoy, -42 * 7), hoy];
      return [hoy, sumarDias(hoy, 42 * 7)];
    }

    function ponerModo(nuevo) {
      modo = nuevo;
      botonNacido.setAttribute("aria-pressed", String(modo === "nacido"));
      botonEmbarazo.setAttribute("aria-pressed", String(modo === "embarazo"));
      campoReferencia.hidden = modo !== "embarazo";
      etiquetaFecha.textContent = etiquetaFecha.getAttribute(modo === "nacido" ? "data-nacido" : "data-" + referencia.value);
      var l = limites();
      entrada.min = aISO(l[0]);
      entrada.max = aISO(l[1]);
      if (entrada.value) calcular();
    }

    function calcular(ev) {
      if (ev) ev.preventDefault();
      hoy = hoyLocal();
      var f = desdeISO(entrada.value);
      error.textContent = "";
      if (!f) {
        error.textContent = t("Escribe una fecha válida.");
        resultado.hidden = true;
        return;
      }
      var l = limites();
      if (f < l[0] || f > l[1]) {
        error.textContent = modo === "nacido"
          ? t("La fecha de nacimiento ha de ser de los últimos 36 meses. Si aún no ha nacido, elige «Estoy embarazada».")
          : referencia.value === "fur"
          ? t("La última regla ha de ser de las últimas 42 semanas.")
          : t("La fecha probable de parto ha de estar entre hoy y dentro de 42 semanas. Si ya ha nacido, elige «Ya ha nacido».");
        resultado.hidden = true;
        return;
      }
      var n = modo === "embarazo" && referencia.value === "fur" ? fppDesdeFUR(f, datos) : f;
      deEmbarazo = modo === "embarazo" ? construirEmbarazo(n, datos, comunidad.value, hoy) : [];
      bloqueEmbarazo.hidden = modo !== "embarazo";
      document.getElementById("semana-actual").hidden = modo !== "embarazo";
      if (modo === "embarazo") {
        var sem = semanaDeEmbarazo(n, hoy, datos);
        document.getElementById("semana-actual").textContent = sem.semanas < 0
          ? t("Fecha probable de parto: {fpp}.", { fpp: formatear(n) })
          : (sem.dias === 0
            ? t("Hoy estás de {s} semanas justas. Fecha probable de parto: {fpp}.", { s: sem.semanas, fpp: formatear(n) })
            : t(sem.dias === 1 ? "Hoy estás de {s} semanas y {d} día. Fecha probable de parto: {fpp}." : "Hoy estás de {s} semanas y {d} días. Fecha probable de parto: {fpp}.", { s: sem.semanas, d: sem.dias, fpp: formatear(n) }));
        var avisoEmb = document.getElementById("aviso-embarazo");
        var comEmb = datos.comunidades[comunidad.value];
        if (!(comEmb.embarazo || []).length) {
          avisoEmb.textContent = t("En tu comunidad aún no hemos cotejado el programa de seguimiento del embarazo de la consejería: lo que ves es la guía del Ministerio de Sanidad. Tu matrona te dará el calendario de tu centro.");
          avisoEmb.hidden = false;
        } else {
          avisoEmb.hidden = true;
        }
        var lineaEmb = document.getElementById("linea-embarazo");
        lineaEmb.textContent = "";
        deEmbarazo.forEach(function (e) {
          var nodo = pintarEvento(e);
          nodo.id = "ev-" + e.id;
          lineaEmb.appendChild(nodo);
        });
      }
      actuales = construirLinea(n, datos, comunidad.value, hoy);
      var nodoProximo = document.getElementById("proximo");
      nodoProximo.textContent = "";
      var siguienteEmb = null;
      deEmbarazo.forEach(function (e) {
        if (e.enCurso) nodoProximo.appendChild(pintarEvento(e));
        else if (!siguienteEmb && e.fecha >= hoy && !e.elementos[0].soloSi) siguienteEmb = e;
      });
      var p = proximo(actuales, hoy);
      if (siguienteEmb) nodoProximo.appendChild(pintarEvento(siguienteEmb));
      else {
        enCurso(actuales).forEach(function (e) { nodoProximo.appendChild(pintarEvento(e)); });
        if (p) nodoProximo.appendChild(pintarEvento(p));
        else nodoProximo.appendChild(el("p", { texto: t("No queda nada con fecha en el calendario oficial hasta los 36 meses.") }));
      }
      var avisoCom = document.getElementById("aviso-comunidad");
      var aviso = datos.comunidades[comunidad.value].aviso_revisiones || "";
      avisoCom.textContent = aviso;
      avisoCom.hidden = !aviso;
      var linea = document.getElementById("linea");
      linea.textContent = "";
      var aparte = { aep: 1, tramite: 1, escuela: 1, suplemento: 1 };
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
      var lineaSup = document.getElementById("linea-suplementos");
      lineaSup.textContent = "";
      actuales.filter(function (e) { return e.tipo === "suplemento"; }).forEach(function (e) {
        var nodo = pintarEvento(e);
        nodo.id = "ev-" + e.id;
        lineaSup.appendChild(nodo);
      });
      var aep = document.getElementById("linea-aep");
      aep.textContent = "";
      actuales.filter(function (e) { return e.tipo === "aep"; }).forEach(function (e) {
        var nodo = pintarEvento(e);
        nodo.id = "ev-" + e.id;
        aep.appendChild(nodo);
      });
      resultado.hidden = false;
      pintarVista(construirVista(actuales, datos, n, hoy, comunidad.value), document.getElementById("vista"));
      if (ev && ev.type === "submit" && resultado.scrollIntoView) resultado.scrollIntoView({ block: "start" });
    }

    form.addEventListener("submit", calcular);
    botonNacido.addEventListener("click", function () { ponerModo("nacido"); });
    botonEmbarazo.addEventListener("click", function () { ponerModo("embarazo"); });
    referencia.addEventListener("change", function () { ponerModo(modo); });
    ponerModo("nacido");
    entrada.addEventListener("change", calcular);
    comunidad.addEventListener("change", calcular);

    botonICS.addEventListener("click", function () {
      if (!actuales) return;
      var ics = generarICS(deEmbarazo.concat(actuales), { desde: hoyLocal() });
      var blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var a = el("a", { href: url, download: t("calendario-bebe.ics") });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });
  }

  // ---------- Presupuesto del primer año ----------
  //
  // Solo las partidas con importe oficial traen un importe; el resto lo escribe la familia.
  // Nada se guarda: al recargar la página se pierde (se puede descargar en CSV).

  function numero(v) {
    if (v === null || v === undefined || v === "") return 0;
    // Los campos numéricos dan el valor con punto decimal; se admite también la coma.
    var n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
    return isFinite(n) && n > 0 ? n : 0;
  }

  function redondear(n) {
    return Math.round(n * 100) / 100;
  }

  function formatearEuros(n) {
    var negativo = n < 0;
    var partes = Math.abs(redondear(n)).toFixed(2).split(".");
    var entero = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    var texto = partes[1] === "00" ? entero : entero + "," + partes[1];
    return (negativo ? "−" : "") + texto + " €";
  }

  // `valores`: { id: { importe, meses, marcada, opcion } } con lo que ha escrito la familia.
  // `extra`: partidas añadidas por la familia ({ id, nombre, periodicidad, importe, meses }).
  function calcularPresupuesto(partidas, valores, extra) {
    valores = valores || {};
    var todas = partidas.concat((extra || []).map(function (x) {
      return { id: x.id, nombre: x.nombre || "Otro gasto", bloque: "gasto", periodicidad: x.periodicidad, importe: null, meses: x.meses };
    }));
    var extraPorId = {};
    (extra || []).forEach(function (x) { extraPorId[x.id] = x; });
    function valor(p) { return valores[p.id] || extraPorId[p.id] || {}; }
    function meses(p) {
      var v = valor(p);
      var m = v.meses !== undefined && v.meses !== "" ? numero(v.meses) : (p.meses || 0);
      return Math.min(12, m);
    }

    var lineas = [];
    var porId = {};
    // Primero los gastos: algunas deducciones dependen de lo que se paga en un gasto.
    todas.filter(function (p) { return p.bloque === "gasto"; }).forEach(function (p) {
      var importe = numero(valor(p).importe);
      var total = p.periodicidad === "mensual" ? importe * meses(p) : importe;
      var l = { id: p.id, nombre: p.nombre, bloque: "gasto", total: redondear(total), cuenta: total > 0 };
      lineas.push(l);
      porId[p.id] = l;
    });
    todas.filter(function (p) { return p.bloque === "ayuda"; }).forEach(function (p) {
      var v = valor(p);
      var total = 0;
      if (p.sobre) {
        var base = porId[p.sobre] ? porId[p.sobre].total : 0;
        total = Math.min(p.tope, base * p.porcentaje / 100);
      } else if (p.opciones) {
        var op = p.opciones[v.opcion === undefined ? 0 : Number(v.opcion)];
        total = op ? op.importe : 0;
      } else {
        var importe = p.importe !== null && p.importe !== undefined ? p.importe : numero(v.importe);
        total = p.periodicidad === "mensual" ? importe * meses(p) : importe;
      }
      var l = { id: p.id, nombre: p.nombre, bloque: "ayuda", total: redondear(total), cuenta: !!v.marcada };
      lineas.push(l);
      porId[p.id] = l;
    });

    var avisos = [];
    partidas.forEach(function (p) {
      if (!porId[p.id] || !porId[p.id].cuenta) return;
      if (p.requiere && !(porId[p.requiere] && porId[p.requiere].cuenta)) {
        avisos.push("«" + p.nombre + "» solo se aplica si tienes derecho a «" + porId[p.requiere].nombre + "».");
      }
      if (p.incompatible_con && porId[p.incompatible_con] && porId[p.incompatible_con].cuenta) {
        avisos.push("«" + p.nombre + "» y «" + porId[p.incompatible_con].nombre + "» no se cobran por el mismo hijo los mismos meses: el total puede ser menor.");
      }
      if (p.sobre && porId[p.sobre] && porId[p.sobre].total === 0) {
        avisos.push("«" + p.nombre + "» se calcula con lo que escribas en «" + porId[p.sobre].nombre + "».");
      }
    });

    var gastos = 0;
    var ayudas = 0;
    lineas.forEach(function (l) {
      if (!l.cuenta) return;
      if (l.bloque === "gasto") gastos += l.total;
      else ayudas += l.total;
    });
    gastos = redondear(gastos);
    ayudas = redondear(ayudas);
    var neto = redondear(gastos - ayudas);
    return { lineas: lineas, gastos: gastos, ayudas: ayudas, neto: neto, porMes: redondear(neto / 12), avisos: avisos };
  }

  function campoCSV(t) {
    t = String(t);
    return /[";\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  }

  function importeCSV(n) {
    return redondear(n).toFixed(2).replace(".", ",");
  }

  // CSV para hojas de cálculo en español: separador «;», coma decimal y BOM para los acentos.
  function generarCSV(resultado, aviso) {
    var filas = [["Tipo", "Partida", "Total primer año (€)"]];
    resultado.lineas.forEach(function (l) {
      if (!l.cuenta) return;
      filas.push([l.bloque === "gasto" ? "Gasto" : "Ayuda", l.nombre, importeCSV(l.bloque === "gasto" ? l.total : -l.total)]);
    });
    filas.push(["", "Total gastos", importeCSV(resultado.gastos)]);
    filas.push(["", "Total ayudas", importeCSV(-resultado.ayudas)]);
    filas.push(["", "Coste neto del primer año", importeCSV(resultado.neto)]);
    filas.push(["", "Media al mes", importeCSV(resultado.porMes)]);
    if (aviso) filas.push(["", aviso, ""]);
    return "﻿" + filas.map(function (f) { return f.map(campoCSV).join(";"); }).join("\r\n") + "\r\n";
  }

  function descargar(texto, tipo, nombre) {
    var blob = new Blob([texto], { type: tipo });
    var url = URL.createObjectURL(blob);
    var a = el("a", { href: url, download: nombre });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function iniciarPresupuesto() {
    var nodo = document.getElementById("datos-presupuesto");
    if (!nodo) return;
    var datosPresupuesto = JSON.parse(nodo.textContent);
    var partidas = datosPresupuesto.partidas;
    var raiz = document.getElementById("presupuesto");
    var lista = document.getElementById("otros-gastos");
    var extra = [];
    var siguiente = 1;
    var ultimo = null;

    function leer() {
      var valores = {};
      raiz.querySelectorAll("[data-partida]").forEach(function (fila) {
        var id = fila.getAttribute("data-partida");
        var v = {};
        fila.querySelectorAll("[data-campo]").forEach(function (c) {
          var campo = c.getAttribute("data-campo");
          v[campo] = c.type === "checkbox" ? c.checked : c.value;
        });
        valores[id] = v;
      });
      extra.forEach(function (x) {
        var v = valores[x.id] || {};
        x.nombre = v.nombre;
        x.periodicidad = v.periodicidad;
        x.importe = v.importe;
        x.meses = v.meses;
      });
      return valores;
    }

    function actualizar() {
      var valores = leer();
      ultimo = calcularPresupuesto(partidas, valores, extra);
      ultimo.lineas.forEach(function (l) {
        var fila = raiz.querySelector('[data-partida="' + l.id + '"]');
        var salida = fila && fila.querySelector(".subtotal");
        if (!salida) return;
        salida.textContent = l.total ? formatearEuros(l.total) : "—";
        fila.classList.toggle("activa", l.cuenta && l.total > 0);
        fila.classList.toggle("sin-contar", l.bloque === "ayuda" && !l.cuenta);
      });
      raiz.querySelectorAll(".fila-meses").forEach(function (m) {
        var sel = m.closest("[data-partida]").querySelector('[data-campo="periodicidad"]');
        if (sel) m.hidden = sel.value !== "mensual";
      });
      document.getElementById("total-gastos").textContent = formatearEuros(ultimo.gastos);
      document.getElementById("total-ayudas").textContent = formatearEuros(ultimo.ayudas);
      document.getElementById("total-neto").textContent = formatearEuros(ultimo.neto);
      document.getElementById("total-mes").textContent = formatearEuros(ultimo.porMes);
      var avisos = document.getElementById("avisos-presupuesto");
      avisos.textContent = "";
      ultimo.avisos.forEach(function (a) { avisos.appendChild(el("li", { texto: a })); });
      avisos.hidden = !ultimo.avisos.length;
    }

    document.getElementById("anadir-gasto").addEventListener("click", function () {
      var id = "otro-" + siguiente++;
      extra.push({ id: id });
      var fila = el("li", { class: "partida otra", "data-partida": id }, [
        el("div", { class: "partida-cabeza" }, [
          el("label", { class: "visualmente-oculto", for: id + "-nombre", texto: "Nombre del gasto" }),
          el("input", { type: "text", id: id + "-nombre", "data-campo": "nombre", placeholder: "Otro gasto", autocomplete: "off" }),
          el("output", { class: "subtotal", texto: "—" }),
        ]),
        el("div", { class: "partida-campos" }, [
          el("label", {}, [el("span", { texto: "Importe (€)" }), el("input", { type: "number", min: "0", step: "0.01", inputmode: "decimal", "data-campo": "importe" })]),
          el("label", {}, [el("span", { texto: "Cada" }), (function () {
            var s = el("select", { "data-campo": "periodicidad" }, [
              el("option", { value: "unico", texto: "Una vez" }),
              el("option", { value: "mensual", texto: "Mes" }),
            ]);
            return s;
          })()]),
          el("label", { class: "fila-meses", hidden: "" }, [el("span", { texto: "Meses" }), el("input", { type: "number", min: "0", max: "12", step: "1", value: "12", "data-campo": "meses" })]),
          el("button", { type: "button", class: "boton-quitar", texto: "Quitar" }),
        ]),
      ]);
      fila.querySelector(".boton-quitar").addEventListener("click", function () {
        extra = extra.filter(function (x) { return x.id !== id; });
        fila.parentNode.removeChild(fila);
        actualizar();
      });
      lista.appendChild(fila);
      fila.querySelector("input").focus();
      actualizar();
    });

    raiz.addEventListener("input", actualizar);
    raiz.addEventListener("change", actualizar);
    document.getElementById("descargar-csv").addEventListener("click", function () {
      actualizar();
      descargar(generarCSV(ultimo, datosPresupuesto.aviso), "text/csv;charset=utf-8", "presupuesto-primer-ano.csv");
    });
    document.getElementById("imprimir-presupuesto").addEventListener("click", function () { window.print(); });
    actualizar();
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
    construirEmbarazo: construirEmbarazo,
    fppDesdeFUR: fppDesdeFUR,
    semanaDeEmbarazo: semanaDeEmbarazo,
    registrosEmbarazo: registrosEmbarazo,
    usarTextos: usarTextos,
    t: t,
    calcularPresupuesto: calcularPresupuesto,
    formatearEuros: formatearEuros,
    generarCSV: generarCSV,
  };
  global.CalendarioBebe = api;

  if (typeof document !== "undefined") {
    var arrancar = function () { iniciar(); iniciarPresupuesto(); };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar);
    else arrancar();
  }
})(typeof window !== "undefined" ? window : this);
