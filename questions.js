// 20 preguntas. Todo el contenido sale de la guía «Sistema Jurídico Mixto» (secciones 1, 2, 5 y 6).
// kind: 'concepto' | 'pais' (adivina el país a partir de una pista)
module.exports = [
  { kind: 'concepto', duration: 20,
    text: '¿Qué es un sistema jurídico mixto?',
    options: ['Uno en el que solo existe el derecho religioso', 'Uno en el que conviven dos o más tradiciones jurídicas dentro de un mismo país o territorio', 'Uno que solo aplica el derecho escrito en códigos', 'Uno en el que no existen tribunales'],
    correct: 1,
    explanation: 'Lo más común es la mezcla de civil law con common law, aunque también pueden entrar el derecho religioso y el consuetudinario (las costumbres de los pueblos).' },

  { kind: 'concepto', duration: 20,
    text: 'En el civil law (tradición de México, Francia, España o Alemania), ¿cuál es la fuente principal del derecho?',
    options: ['El precedente judicial', 'La costumbre de los pueblos', 'La ley escrita y codificada', 'El derecho religioso'],
    correct: 2,
    explanation: 'En el civil law el juez aplica el código. Por eso en el stand es el lado rojo.' },

  { kind: 'concepto', duration: 20,
    text: 'En el common law (tradición de Inglaterra o Estados Unidos), ¿qué pesa mucho al resolver un caso?',
    options: ['El precedente judicial: lo que ya resolvieron los jueces', 'Solo el Código Civil', 'Únicamente las costumbres familiares', 'El número de abogados presentes'],
    correct: 0,
    explanation: 'Lo que ya resolvieron los jueces obliga en casos parecidos. Es el lado azul del stand.' },

  { kind: 'concepto', duration: 20,
    text: 'En el concepto de color del proyecto, rojo (civil law) + azul (common law) = …',
    options: ['Dorado', 'Verde', 'Naranja', 'Morado: el sistema mixto'],
    correct: 3,
    explanation: 'Rojo + azul = morado. El rojo y el azul se usan solo para «civil» y «common»; el morado es el protagonista.' },

  { kind: 'pais', duration: 30,
    text: 'Pista 1. Mi derecho general es romano-holandés (de la época neerlandesa), recibí mucho common law inglés y además aplico leyes personales tradicionales: la ley kandyana, el Thesawalamai de los tamiles del norte y el derecho musulmán. ¿Quién soy?',
    options: ['Sri Lanka', 'India', 'Singapur', 'Tailandia'],
    correct: 0,
    explanation: 'Los británicos conservaron el derecho romano-holandés como derecho común del país y respetaron las leyes personales de cada comunidad.' },

  { kind: 'pais', duration: 30,
    text: 'Pista 2. Mi base es el common law inglés, pero los musulmanes acuden a tribunales de la sharía en asuntos de familia, y en los estados de Sabah y Sarawak hay tribunales nativos que aplican el derecho consuetudinario. ¿Quién soy?',
    options: ['Nepal', 'Malasia', 'Japón', 'Bután'],
    correct: 1,
    explanation: 'La Constitución federal reparte competencias: el derecho islámico de familia corresponde a los estados, y Sabah y Sarawak conservan sus Native Courts.' },

  { kind: 'pais', duration: 30,
    text: 'Pista 3. Mi Constitución de 1996, en su sección 211, ordena a los tribunales aplicar el derecho consuetudinario cuando corresponda, y mi derecho privado es romano-holandés. ¿Quién soy?',
    options: ['India', 'Australia', 'Egipto', 'Sudáfrica'],
    correct: 3,
    explanation: 'Mezcla derecho romano-holandés, common law inglés y derecho consuetudinario africano, siempre sujeto a la Constitución.' },

  { kind: 'pais', duration: 30,
    text: 'Pista 4. Tengo common law de origen británico, pero para el matrimonio, el divorcio y la herencia aplico «leyes personales» según la religión: por ejemplo, la Ley de Matrimonio Hindú de 1955 o la Ley de Aplicación del Derecho Personal Musulmán (Shariat) de 1937. ¿Quién soy?',
    options: ['Japón', 'Canadá', 'India', 'Brasil'],
    correct: 2,
    explanation: 'Es el ejemplo clásico de common law combinado con derecho religioso en el estatuto personal.' },

  { kind: 'pais', duration: 30,
    text: 'Pista 5. Mi Código Civil (1950) tiene raíces en el Código Civil español, pero mi Constitución y mis procesos judiciales recibieron una fuerte influencia de Estados Unidos, que me gobernó de 1898 a 1946. ¿Quién soy?',
    options: ['México', 'Filipinas', 'Tailandia', 'Corea del Sur'],
    correct: 1,
    explanation: 'Además, cuenta con un Código de Leyes Personales Musulmanas (1977) y tribunales de la sharía para la población musulmana.' },

  { kind: 'pais', duration: 30,
    text: 'Pista 6. En mi territorio no se celebran matrimonios civiles: el matrimonio y el divorcio de cada comunidad los deciden tribunales religiosos (rabínicos, de la sharía, cristianos o drusos), mientras mi derecho general mezcla el common law del Mandato británico con leyes propias. ¿Quién soy?',
    options: ['Turquía', 'Grecia', 'Chile', 'Israel'],
    correct: 3,
    explanation: 'La Ley de Jurisdicción de los Tribunales Rabínicos (1953) les da competencia exclusiva sobre el matrimonio y el divorcio de los judíos en el país.' },

  { kind: 'pais', duration: 30,
    text: 'Pista 7. En la era Meiji adopté un Código Civil (1896–1898) inspirado sobre todo en el proyecto del BGB alemán, y después de 1945 mi Constitución recibió influencia estadounidense. ¿Quién soy?',
    options: ['China', 'Alemania', 'Japón', 'India'],
    correct: 2,
    explanation: 'Combinó influencias alemana y francesa con elementos propios, y tras la Segunda Guerra Mundial con instituciones angloamericanas.' },

  { kind: 'pais', duration: 30,
    text: 'Pista 8. Formo parte del Reino Unido, pero mi derecho privado tiene raíces romanas y civilistas. No tengo código: mis «escritores institucionales», como Stair (1681), son fuente importante, y mi tribunal civil superior es el Court of Session. ¿Quién soy?',
    options: ['Gales', 'Irlanda del Norte', 'Escocia', 'Inglaterra'],
    correct: 2,
    explanation: 'El Tratado de Unión de 1707 preservó su sistema jurídico propio: es un sistema mixto clásico.' },

  { kind: 'concepto', duration: 20,
    text: '¿Qué conservó el sistema jurídico propio de Escocia dentro del Reino Unido?',
    options: ['La Constitución de 1996', 'El Mandato británico', 'El Código Civil de 1950', 'El Tratado de Unión de 1707'],
    correct: 3,
    explanation: 'Escocia es un caso aparte: su sistema se conservó con la unión política de 1707.' },

  { kind: 'concepto', duration: 20,
    text: 'Mauricio fue colonia francesa y luego británica. ¿Qué dos tradiciones combina según JuriGlobe?',
    options: ['Civil + common', 'Common + musulmán', 'Civil + musulmán', 'Solo derecho consuetudinario'],
    correct: 0,
    explanation: 'Mauricio es, junto con Sudáfrica, Filipinas y Botsuana, un ejemplo de mezcla civil + common en la lista de JuriGlobe.' },

  { kind: 'concepto', duration: 20,
    text: 'Japón, Tailandia y Taiwán son ejemplos de un camino distinto a la conquista. ¿Cuál?',
    options: ['Preservación del derecho religioso', 'Modernización voluntaria: adoptar códigos europeos y luego recibir influencias angloamericanas', 'Cesión de territorio', 'Colonización neerlandesa'],
    correct: 1,
    explanation: 'Son países que decidieron modernizarse importando modelos jurídicos europeos.' },

  { kind: 'concepto', duration: 20,
    text: 'En el frasco de las 3 arenas, la arena dorada de arriba representa…',
    options: ['El civil law', 'El common law', 'El derecho religioso o consuetudinario', 'La Constitución'],
    correct: 2,
    explanation: 'Abajo rojo (civil law), en medio azul (common law) y arriba dorado (religioso/consuetudinario). Las capas no se borran: conviven.' },

  { kind: 'concepto', duration: 20,
    text: '¿Quién explicó que el orden jurídico es escalonado, con cada norma apoyada en una norma superior?',
    options: ['Stair', 'Hans Kelsen', 'Vernon Palmer', 'Montesquieu'],
    correct: 1,
    explanation: 'Es la pirámide normativa estilo Kelsen. En México, la Constitución y los derechos humanos de los tratados están en la cúspide (arts. 1 y 133 constitucionales).' },

  { kind: 'concepto', duration: 20,
    text: 'Dato fino del lado common law: ¿de qué país es más típico el mazo (gavel)?',
    options: ['De Inglaterra', 'De Estados Unidos', 'De Francia', 'De México'],
    correct: 1,
    explanation: 'El mazo es más típico de EE. UU.; en los tribunales ingleses casi no se usa.' },

  { kind: 'concepto', duration: 20,
    text: '¿De qué universidad es el proyecto JuriGlobe, que clasifica los sistemas jurídicos mixtos?',
    options: ['Universidad de Edimburgo', 'Universidad de Tokio', 'UNAM', 'Universidad de Ottawa'],
    correct: 3,
    explanation: 'JuriGlobe, de la Universidad de Ottawa, usa un criterio amplio: cuenta también combinaciones con derecho religioso y consuetudinario.' },

  { kind: 'concepto', duration: 20,
    text: '¿Cuántos países tienen sistema jurídico mixto?',
    options: ['Exactamente 22', 'Exactamente 5', 'No hay cifra oficial única: depende del criterio', 'Solo Escocia y Sudáfrica'],
    correct: 2,
    explanation: 'Depende de si se cuenta solo civil + common o también el derecho religioso y consuetudinario, y de si se cuentan Estados o también regiones. Según JuriGlobe, son decenas de países y territorios.' }
];
